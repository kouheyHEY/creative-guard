import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const installer = join(packageRoot, 'scripts', 'install-repo.mjs');
const targets = [
  ['examples/creative-guard.yml', '.github/workflows/creative-guard.yml'],
  ['examples/ISSUE_TEMPLATE/creative-focus.md', '.github/ISSUE_TEMPLATE/creative-focus.md'],
  ['examples/ISSUE_TEMPLATE/creative-idea.md', '.github/ISSUE_TEMPLATE/creative-idea.md'],
  ['examples/ISSUE_TEMPLATE/creative-exception.md', '.github/ISSUE_TEMPLATE/creative-exception.md'],
];

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'creative-guard-install-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  assert.equal(spawnSync('git', ['init', '-q', dir]).status, 0);
  return dir;
}

function run(dir, ...args) {
  return spawnSync(process.execPath, [installer, dir, ...args], { encoding: 'utf8' });
}

test('preview is read-only, then apply copies the four exact files and rerun is idempotent', async t => {
  const dir = await fixture(t);
  const preview = run(dir);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /4 file\(s\) to add/);
  await assert.rejects(access(join(dir, '.github')));

  const apply = run(dir, '--apply');
  assert.equal(apply.status, 0, apply.stderr);
  for (const [source, destination] of targets) {
    assert.equal(await readFile(join(dir, destination), 'utf8'), await readFile(join(packageRoot, source), 'utf8'));
  }
  const again = run(dir, '--apply');
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stdout, /already installed/);
});

test('different existing target file is never overwritten, including when other targets are missing', async t => {
  const dir = await fixture(t);
  await mkdir(join(dir, '.github', 'workflows'), { recursive: true });
  const workflow = join(dir, '.github', 'workflows', 'creative-guard.yml');
  await writeFile(workflow, 'custom workflow\n');
  const result = run(dir, '--apply');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /conflict/);
  assert.equal(await readFile(workflow, 'utf8'), 'custom workflow\n');
  await assert.rejects(access(join(dir, '.github', 'ISSUE_TEMPLATE')));
});

test('repository instructions require explicit acknowledgement before applying', async t => {
  const dir = await fixture(t);
  await writeFile(join(dir, 'AGENTS.md'), '# Project instructions\n');
  const blocked = run(dir, '--apply');
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /AGENTS\.md/);
  await assert.rejects(access(join(dir, '.github')));
  const accepted = run(dir, '--apply', '--ack-instructions');
  assert.equal(accepted.status, 0, accepted.stderr);
});

test('installer refuses a nested path that is not the repository root', async t => {
  const dir = await fixture(t);
  const nested = join(dir, 'nested');
  await mkdir(nested);
  const result = run(nested, '--apply');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /repository root/);
  await assert.rejects(access(join(dir, '.github')));
});
