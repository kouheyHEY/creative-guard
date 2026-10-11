export const targetPaths = [
  '.github/workflows/creative-guard.yml',
  '.github/ISSUE_TEMPLATE/creative-focus.md',
  '.github/ISSUE_TEMPLATE/creative-idea.md',
  '.github/ISSUE_TEMPLATE/creative-exception.md',
];

export const onboardingBranch = 'creative-guard/auto-onboard';

const pullBody = `This draft PR adds Creative Guard's caller workflow and three Issue templates. It does not change application code or enable a required check.

Before merging:
- Review the four added files and any repository-specific instructions.
- After merging, create the four Creative Guard labels and a Focus Issue.
- Test a focused PR and an exception before considering a required-check ruleset.

The shared Action is pinned to a tested commit. AI idea classification remains advisory and provider-neutral.`;

function classifyTree(tree) {
  if (tree.truncated) return { status: 'review', reason: 'tree-truncated' };
  const entries = new Map((tree.tree ?? []).map(entry => [entry.path, entry]));
  if (entries.has('AGENTS.md') || entries.has('.github/AGENTS.md')) {
    return { status: 'review', reason: 'repository-instructions' };
  }
  for (const path of ['.github', '.github/workflows', '.github/ISSUE_TEMPLATE']) {
    if (entries.has(path) && entries.get(path).type !== 'tree') {
      return { status: 'review', reason: 'directory-conflict' };
    }
  }
  const present = targetPaths.filter(path => entries.has(path));
  if (present.some(path => entries.get(path).type !== 'blob' || entries.get(path).mode !== '100644')) {
    return { status: 'review', reason: 'target-file-conflict' };
  }
  if (present.length === targetPaths.length) return { status: 'installed', reason: 'all-target-files-present' };
  if (present.length) return { status: 'review', reason: 'partial-installation' };
  return { status: 'ready', reason: 'all-target-files-missing' };
}

export async function autoOnboard(api, { owner, apply = false, maxPrs = 5, files }) {
  if (!owner || !/^[A-Za-z0-9-]+$/.test(owner)) throw new Error('A valid account owner is required.');
  if (!Number.isInteger(maxPrs) || maxPrs < 1 || maxPrs > 20) throw new Error('maxPrs must be between 1 and 20.');
  if (targetPaths.some(path => typeof files?.[path] !== 'string')) throw new Error('All four source files are required.');

  const repositories = await api.listRepos();
  const results = [];
  let created = 0;
  for (const repo of repositories) {
    const result = { name: repo.name, status: 'skip', reason: '' };
    results.push(result);
    if (repo.owner?.login?.toLowerCase() !== owner.toLowerCase()) { result.reason = 'different-owner'; continue; }
    if (repo.name === 'creative-guard') { result.reason = 'source-repository'; continue; }
    if (repo.archived || repo.disabled) { result.reason = 'archived-or-disabled'; continue; }
    if (!repo.default_branch) { result.reason = 'no-default-branch'; continue; }
    if (repo.has_issues === false) { result.status = 'review'; result.reason = 'issues-disabled'; continue; }

    try {
      const base = await api.getRef(repo, repo.default_branch);
      if (!base) { result.reason = 'empty-repository'; continue; }
      const commit = await api.getCommit(repo, base.object.sha);
      const tree = await api.getTree(repo, commit.tree.sha);
      Object.assign(result, classifyTree(tree));
      if (result.status !== 'ready') continue;

      const existingBranch = await api.getRef(repo, onboardingBranch);
      if (existingBranch) {
        const openPull = await api.getOpenPull(repo, onboardingBranch);
        result.status = openPull ? 'pending' : 'review';
        result.reason = openPull ? 'draft-pr-exists' : 'automation-branch-exists';
        continue;
      }
      if (!apply) continue;
      if (created >= maxPrs) { result.status = 'deferred'; result.reason = 'batch-limit'; continue; }

      const newTree = await api.createTree(repo, {
        base_tree: commit.tree.sha,
        tree: targetPaths.map(path => ({ path, mode: '100644', type: 'blob', content: files[path] })),
      });
      const newCommit = await api.createCommit(repo, {
        message: 'feat: add Creative Guard workflow and issue templates',
        tree: newTree.sha,
        parents: [base.object.sha],
      });
      await api.createRef(repo, { ref: `refs/heads/${onboardingBranch}`, sha: newCommit.sha });
      const pull = await api.createPull(repo, {
        title: 'feat: add Creative Guard workflow',
        head: onboardingBranch,
        base: repo.default_branch,
        draft: true,
        body: pullBody,
      });
      result.status = 'created';
      result.reason = 'draft-pr-created';
      result.url = pull.html_url;
      created += 1;
    } catch (error) {
      result.status = 'error';
      result.reason = error.message;
    }
  }
  return results;
}
