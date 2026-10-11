import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const owner = process.argv[2];
if (!owner || !/^[A-Za-z0-9-]+$/.test(owner)) {
  console.error('Usage: node scripts/audit-rollout.mjs OWNER');
  process.exit(2);
}

async function gh(...args) {
  const { stdout } = await run('gh', args, { maxBuffer: 30 * 1024 * 1024 });
  return JSON.parse(stdout);
}

const repos = await gh('repo', 'list', owner, '--limit', '200', '--json', 'name,isArchived,isFork,isPrivate,defaultBranchRef');
const targetPaths = [
  '.github/workflows/creative-guard.yml',
  '.github/ISSUE_TEMPLATE/creative-focus.md',
  '.github/ISSUE_TEMPLATE/creative-idea.md',
  '.github/ISSUE_TEMPLATE/creative-exception.md',
];
const results = [];

for (const repo of repos) {
  if (repo.name === 'creative-guard') continue;
  const result = { name: repo.name, branch: repo.defaultBranchRef?.name, private: repo.isPrivate, fork: repo.isFork, archived: repo.isArchived };
  if (repo.isArchived || !result.branch) {
    result.status = 'skip';
    results.push(result);
    continue;
  }
  try {
    const tree = await gh('api', `repos/${owner}/${repo.name}/git/trees/${result.branch}?recursive=1`);
    const paths = new Set((tree.tree || []).map(item => item.path));
    result.instructions = [...paths].filter(path => path === 'AGENTS.md' || path === '.github/AGENTS.md');
    result.conflicts = targetPaths.filter(path => paths.has(path));
    result.truncated = Boolean(tree.truncated);
    result.status = result.instructions.length || result.conflicts.length || result.truncated ? 'review' : 'ready';
  } catch (error) {
    result.status = 'error';
    result.error = String(error.message).split('\n')[0];
  }
  results.push(result);
}

console.log(JSON.stringify({
  owner,
  count: results.length,
  ready: results.filter(result => result.status === 'ready').length,
  review: results.filter(result => result.status === 'review').length,
  skipped: results.filter(result => result.status === 'skip').length,
  errors: results.filter(result => result.status === 'error').length,
  results,
}, null, 2));
