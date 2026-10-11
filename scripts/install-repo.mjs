import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  ['examples/creative-guard.yml', '.github/workflows/creative-guard.yml'],
  ['examples/ISSUE_TEMPLATE/creative-focus.md', '.github/ISSUE_TEMPLATE/creative-focus.md'],
  ['examples/ISSUE_TEMPLATE/creative-idea.md', '.github/ISSUE_TEMPLATE/creative-idea.md'],
  ['examples/ISSUE_TEMPLATE/creative-exception.md', '.github/ISSUE_TEMPLATE/creative-exception.md'],
];

const args = process.argv.slice(2);
const targetArg = args.find(arg => !arg.startsWith('--'));
const flags = args.filter(arg => arg.startsWith('--'));
if (!targetArg || flags.some(flag => !['--apply', '--ack-instructions'].includes(flag)) || args.filter(arg => !arg.startsWith('--')).length !== 1) {
  console.error('Usage: node scripts/install-repo.mjs PATH_TO_REPOSITORY [--apply] [--ack-instructions]');
  process.exit(2);
}

try {
  const target = resolve(targetArg);
  const root = resolve(execFileSync('git', ['-C', target, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
  if (root.toLowerCase() !== target.toLowerCase()) throw new Error('PATH_TO_REPOSITORY must be the repository root.');

  const instructions = ['AGENTS.md', '.github/AGENTS.md'].filter(path => existsSync(join(target, path)));
  const results = files.map(([source, destination]) => {
    const parts = destination.split('/');
    let current = target;
    for (const part of parts.slice(0, -1)) {
      current = join(current, part);
      if (existsSync(current) && (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink())) {
        return { source, destination, status: 'conflict' };
      }
    }
    const output = join(target, destination);
    if (!existsSync(output)) return { source, destination, status: 'missing' };
    if (!lstatSync(output).isFile() || lstatSync(output).isSymbolicLink()) {
      return { source, destination, status: 'conflict' };
    }
    const expected = readFileSync(join(packageRoot, source), 'utf8').replaceAll('\r\n', '\n');
    const actual = readFileSync(output, 'utf8').replaceAll('\r\n', '\n');
    return { source, destination, status: actual === expected ? 'installed' : 'conflict' };
  });

  for (const item of results) console.log(`${item.status}: ${item.destination}`);
  if (instructions.length) console.log(`Repository instructions found: ${instructions.join(', ')}`);
  const conflicts = results.filter(item => item.status === 'conflict');
  if (conflicts.length) throw new Error(`${conflicts.length} conflict(s); no files were changed.`);

  const missing = results.filter(item => item.status === 'missing');
  if (!flags.includes('--apply')) {
    console.log(`Preview: ${missing.length} file(s) to add. Nothing changed. Use --apply after reviewing the repository instructions.`);
    process.exit(0);
  }
  if (instructions.length && !flags.includes('--ack-instructions')) {
    throw new Error(`Read ${instructions.join(', ')} and rerun with --ack-instructions; no files were changed.`);
  }
  if (!missing.length) {
    console.log('Creative Guard is already installed; nothing changed.');
    process.exit(0);
  }
  for (const item of missing) {
    const output = join(target, item.destination);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, readFileSync(join(packageRoot, item.source)), { flag: 'wx' });
    console.log(`added: ${item.destination}`);
  }
  console.log('Files added. Review the diff, then commit or open a PR. Labels, Focus Issue, and required checks remain separate steps.');
} catch (error) {
  console.error(`Installation stopped: ${error.message}`);
  process.exit(1);
}
