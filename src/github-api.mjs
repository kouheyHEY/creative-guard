export function createGitHubApi(token, { apiBase = 'https://api.github.com', fetchImpl = fetch } = {}) {
  if (!token) throw new Error('GH_TOKEN is required.');
  const base = apiBase.replace(/\/$/, '');

  async function request(method, path, body, { allow404 = false } = {}) {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'creative-guard-onboarder',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub API ${response.status} on ${method} ${path.split('?')[0]}`);
    return response.json();
  }

  const repoPath = repo => `/repos/${encodeURIComponent(repo.owner.login)}/${encodeURIComponent(repo.name)}`;
  const refPath = branch => branch.split('/').map(encodeURIComponent).join('/');
  return {
    async listRepos() {
      const all = [];
      for (let page = 1; page <= 100; page += 1) {
        const response = await request('GET', `/installation/repositories?per_page=100&page=${page}`);
        if (!Array.isArray(response.repositories)) throw new Error('Invalid installation repository listing.');
        all.push(...response.repositories);
        if (response.repositories.length < 100) return all;
      }
      throw new Error('Repository listing exceeded 100 pages.');
    },
    getRef: (repo, branch) => request('GET', `${repoPath(repo)}/git/ref/heads/${refPath(branch)}`, undefined, { allow404: true }),
    getCommit: (repo, sha) => request('GET', `${repoPath(repo)}/git/commits/${encodeURIComponent(sha)}`),
    getTree: (repo, sha) => request('GET', `${repoPath(repo)}/git/trees/${encodeURIComponent(sha)}?recursive=1`),
    async getOpenPull(repo, branch) {
      const head = encodeURIComponent(`${repo.owner.login}:${branch}`);
      const pulls = await request('GET', `${repoPath(repo)}/pulls?state=open&head=${head}&per_page=1`);
      return pulls[0] ?? null;
    },
    createTree: (repo, body) => request('POST', `${repoPath(repo)}/git/trees`, body),
    createCommit: (repo, body) => request('POST', `${repoPath(repo)}/git/commits`, body),
    createRef: (repo, body) => request('POST', `${repoPath(repo)}/git/refs`, body),
    createPull: (repo, body) => request('POST', `${repoPath(repo)}/pulls`, body),
  };
}
