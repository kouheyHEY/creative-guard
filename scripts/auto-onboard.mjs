import { readFile } from 'node:fs/promises';
import { createGitHubApi } from '../src/github-api.mjs';
import { autoOnboard, targetPaths } from '../src/onboard.mjs';

const args = process.argv.slice(2);
let owner = process.env.GITHUB_REPOSITORY_OWNER;
let maxPrs = 5;
let apply = false;
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--apply') apply = true;
  else if (args[index] === '--owner') owner = args[++index];
  else if (args[index] === '--max-prs') maxPrs = Number(args[++index]);
  else {
    console.error('Usage: node scripts/auto-onboard.mjs --owner OWNER [--max-prs 1..20] [--apply]');
    process.exit(2);
  }
}

const sources = [
  'examples/creative-guard.yml',
  'examples/ISSUE_TEMPLATE/creative-focus.md',
  'examples/ISSUE_TEMPLATE/creative-idea.md',
  'examples/ISSUE_TEMPLATE/creative-exception.md',
];
try {
  const files = Object.fromEntries(await Promise.all(targetPaths.map(async (path, index) => [
    path,
    await readFile(new URL(`../${sources[index]}`, import.meta.url), 'utf8'),
  ])));
  const api = createGitHubApi(process.env.GH_TOKEN, { apiBase: process.env.GITHUB_API_URL });
  const results = await autoOnboard(api, { owner, apply, maxPrs, files });
  const summary = Object.fromEntries([...new Set(results.map(result => result.status))].map(status => [
    status, results.filter(result => result.status === status).length,
  ]));
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', owner, summary, results }, null, 2));
  if (results.some(result => result.status === 'error')) process.exitCode = 1;
} catch (error) {
  console.error(`Auto-onboarding stopped: ${error.message}`);
  process.exitCode = 1;
}
