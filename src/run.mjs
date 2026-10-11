import { readFile } from 'node:fs/promises';
import { approvalDigest, evaluate, labels, parseException, todayInZone } from './core.mjs';

const token = process.env.CG_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const mode = process.env.CG_MODE || 'check';
const eventPath = process.env.GITHUB_EVENT_PATH;

if (!token || !repository || !eventPath) throw new Error('Missing GitHub Actions context');
const event = JSON.parse(await readFile(eventPath, 'utf8'));
const headers = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
};

async function api(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${path}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function pages(path) {
  const values = [];
  for (let page = 1; ; page += 1) {
    const separator = path.includes('?') ? '&' : '?';
    const batch = await api(`${path}${separator}per_page=100&page=${page}`);
    values.push(...batch);
    if (batch.length < 100) return values;
  }
}

async function focusIssues() {
  const issues = await pages(`/issues?state=open&labels=${encodeURIComponent(labels.focus)}`);
  return issues.filter(issue => !issue.pull_request);
}

async function check() {
  if (!event.pull_request) throw new Error('check mode requires a pull_request event');
  const focus = await focusIssues();
  const linked = String(event.pull_request.body ?? '').match(/^Creative Guard Exception: #([1-9]\d*)\s*$/im);
  let exceptionIssue = null;
  let exceptionComments = [];
  if (linked) {
    const number = Number(linked[1]);
    exceptionIssue = await api(`/issues/${number}`);
    exceptionComments = await pages(`/issues/${number}/comments`);
  }
  const result = evaluate({
    focusIssues: focus,
    prBody: event.pull_request.body,
    exceptionIssue,
    exceptionComments,
    owner: repository.split('/')[0],
    today: todayInZone(new Date(), process.env.CG_TIME_ZONE || 'UTC'),
  });
  if (result.ok) {
    console.log(result.reason);
  } else {
    for (const error of result.errors) console.error(`::error::${error}`);
    process.exitCode = 1;
  }
}

async function intake() {
  if (!event.issue || event.issue.pull_request) return;
  if (event.issue.labels?.some(label => label.name === labels.exception)) {
    const request = parseException(event.issue.body);
    if (request.errors.length) return;
    const digest = approvalDigest(event.issue.body);
    const marker = `<!-- creative-guard-approval:${digest} -->`;
    const comments = await pages(`/issues/${event.issue.number}/comments`);
    if (!comments.some(comment => String(comment.body ?? '').includes(marker))) {
      await api(`/issues/${event.issue.number}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: `${marker}\nTo approve this exact request, the repository owner may comment:\n\n\`/creative-guard approve ${digest}\`` }),
      });
    }
    return;
  }
  if (!event.issue.labels?.some(label => label.name === labels.idea)) return;
  if (event.issue.labels.some(label => label.name === labels.later)) return;
  const focus = await focusIssues();
  if (focus.length !== 1) return;
  await api(`/issues/${event.issue.number}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labels: [labels.later] }),
  });
  console.log(`Parked idea #${event.issue.number} while focus #${focus[0].number} is active`);
}

if (mode === 'check') await check();
else if (mode === 'intake') await intake();
else throw new Error(`Unsupported mode: ${mode}`);
