// Installs the versioned git hooks in scripts/githooks/ into the checkout's
// hooks dir (`bun run setup:hooks`; auto-run from postinstall on `bun install`).
// Uses `git rev-parse --git-path` so linked worktrees resolve to their own dir.
// Warns instead of failing outside a git checkout (tarballs, Nix builds).
import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');
const HOOKS = ['pre-commit', 'pre-push'];

export function setupHooks(): void {
  const rev = spawnSync('git', ['rev-parse', '--git-path', 'hooks'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (rev.status !== 0) {
    process.stderr.write('setup:hooks: not a git checkout — skipping hook install.\n');
    return;
  }
  let hooksDir = String(rev.stdout ?? '').trim();
  if (!hooksDir) {
    process.stderr.write('setup:hooks: could not resolve hooks dir — skipping.\n');
    return;
  }
  if (!hooksDir.startsWith('/')) hooksDir = join(ROOT, hooksDir);
  mkdirSync(hooksDir, { recursive: true });
  for (const hook of HOOKS) {
    copyFileSync(join(ROOT, 'scripts', 'githooks', hook), join(hooksDir, hook));
    chmodSync(join(hooksDir, hook), 0o755);
  }
  console.log(`setup:hooks: installed ${HOOKS.join(', ')} → ${hooksDir}`);
}

if (import.meta.main) setupHooks();
