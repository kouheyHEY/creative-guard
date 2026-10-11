import test from 'node:test';
import assert from 'node:assert/strict';
import { createGitHubApi } from '../src/github-api.mjs';

test('installation repository listing is paginated and does not use user-wide repositories', async () => {
  const urls = [];
  const fetchImpl = async (url, options) => {
    urls.push(url);
    assert.equal(options.headers.Authorization, 'Bearer example-token');
    const page = Number(new URL(url).searchParams.get('page'));
    return { ok: true, json: async () => ({ repositories: Array.from({ length: page === 1 ? 100 : 1 }, (_, n) => ({ name: `${page}-${n}` })) }) };
  };
  const api = createGitHubApi('example-token', { fetchImpl });
  assert.equal((await api.listRepos()).length, 101);
  assert.equal(urls.length, 2);
  assert.ok(urls.every(url => url.includes('/installation/repositories?')));
});

test('missing automation branch returns null and creation uses draft pull endpoint', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/git/ref/heads/creative-guard/auto-onboard')) return { status: 404, ok: false };
    return { ok: true, json: async () => ({ html_url: 'https://github.com/owner/repo/pull/1' }) };
  };
  const api = createGitHubApi('example-token', { fetchImpl });
  const repo = { name: 'repo', owner: { login: 'owner' } };
  assert.equal(await api.getRef(repo, 'creative-guard/auto-onboard'), null);
  await api.createPull(repo, { head: 'creative-guard/auto-onboard', base: 'main', draft: true });
  assert.match(calls[1].url, /\/repos\/owner\/repo\/pulls$/);
  assert.equal(JSON.parse(calls[1].options.body).draft, true);
});
