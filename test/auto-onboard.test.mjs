import test from 'node:test';
import assert from 'node:assert/strict';
import { autoOnboard, targetPaths } from '../src/onboard.mjs';

const owner = 'kouheyHEY';
const files = Object.fromEntries(targetPaths.map(path => [path, `content of ${path}\n`]));
const repo = (name, overrides = {}) => ({ name, owner: { login: owner }, default_branch: 'main', archived: false, disabled: false, ...overrides });

function fakeApi(repositories, trees = {}) {
  const writes = [];
  const api = {
    writes,
    async listRepos() { return repositories; },
    async getRef(r, branch) { return branch === 'main' ? { object: { sha: `${r.name}-base` } } : null; },
    async getCommit(r) { return { tree: { sha: `${r.name}-tree` } }; },
    async getTree(r) { return trees[r.name] ?? { truncated: false, tree: [] }; },
    async getOpenPull() { return null; },
    async createTree(r, body) { writes.push(['tree', r.name, body]); return { sha: 'new-tree' }; },
    async createCommit(r, body) { writes.push(['commit', r.name, body]); return { sha: 'new-commit' }; },
    async createRef(r, body) { writes.push(['ref', r.name, body]); },
    async createPull(r, body) { writes.push(['pull', r.name, body]); return { html_url: `https://github.com/${owner}/${r.name}/pull/1` }; },
  };
  return api;
}

test('preview finds a ready repository without changing GitHub state', async () => {
  const api = fakeApi([repo('new-game')]);
  const results = await autoOnboard(api, { owner, apply: false, maxPrs: 5, files });
  assert.deepEqual(results.map(result => [result.name, result.status]), [['new-game', 'ready']]);
  assert.deepEqual(api.writes, []);
});

test('apply creates one four-file commit and a draft PR without touching the default branch', async () => {
  const api = fakeApi([repo('new-game')]);
  const results = await autoOnboard(api, { owner, apply: true, maxPrs: 5, files });
  assert.equal(results[0].status, 'created');
  assert.deepEqual(api.writes.map(write => write[0]), ['tree', 'commit', 'ref', 'pull']);
  assert.deepEqual(api.writes[0][2].tree.map(entry => entry.path), targetPaths);
  assert.equal(api.writes[0][2].base_tree, 'new-game-tree');
  assert.deepEqual(api.writes[1][2].parents, ['new-game-base']);
  assert.match(api.writes[2][2].ref, /^refs\/heads\/creative-guard\//);
  assert.equal(api.writes[3][2].draft, true);
  assert.equal(api.writes[3][2].base, 'main');
});

test('installed, partial, instructed, archived, empty, foreign and source repositories are skipped', async () => {
  const repositories = [
    repo('installed'), repo('partial'), repo('instructed'), repo('archived', { archived: true }),
    repo('empty', { default_branch: null }), repo('no-issues', { has_issues: false }),
    repo('foreign', { owner: { login: 'someoneElse' } }), repo('creative-guard'),
  ];
  const api = fakeApi(repositories, {
    installed: { truncated: false, tree: targetPaths.map(path => ({ path, type: 'blob', mode: '100644' })) },
    partial: { truncated: false, tree: [{ path: targetPaths[0], type: 'blob', mode: '100644' }] },
    instructed: { truncated: false, tree: [{ path: 'AGENTS.md', type: 'blob', mode: '100644' }] },
  });
  const results = await autoOnboard(api, { owner, apply: true, maxPrs: 5, files });
  assert.deepEqual(results.map(result => [result.name, result.status]), [
    ['installed', 'installed'], ['partial', 'review'], ['instructed', 'review'],
    ['archived', 'skip'], ['empty', 'skip'], ['no-issues', 'review'], ['foreign', 'skip'], ['creative-guard', 'skip'],
  ]);
  assert.deepEqual(api.writes, []);
});

test('truncated trees and symlink targets require human review', async () => {
  const api = fakeApi([repo('truncated'), repo('symlink')], {
    truncated: { truncated: true, tree: [] },
    symlink: { truncated: false, tree: [{ path: targetPaths[0], type: 'blob', mode: '120000' }] },
  });
  const results = await autoOnboard(api, { owner, apply: true, maxPrs: 5, files });
  assert.deepEqual(results.map(result => result.reason), ['tree-truncated', 'target-file-conflict']);
  assert.deepEqual(api.writes, []);
});

test('an existing automation branch is never overwritten or duplicated', async () => {
  const api = fakeApi([repo('new-game')]);
  api.getRef = async (_r, branch) => branch === 'main' ? { object: { sha: 'base' } } : { object: { sha: 'existing' } };
  const results = await autoOnboard(api, { owner, apply: true, maxPrs: 5, files });
  assert.equal(results[0].status, 'review');
  assert.deepEqual(api.writes, []);
});

test('batch cap defers extra repositories without writing to them', async () => {
  const api = fakeApi([repo('one'), repo('two')]);
  const results = await autoOnboard(api, { owner, apply: true, maxPrs: 1, files });
  assert.deepEqual(results.map(result => result.status), ['created', 'deferred']);
  assert.deepEqual(api.writes.map(write => write[1]), ['one', 'one', 'one', 'one']);
});
