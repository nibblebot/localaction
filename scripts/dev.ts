// `bun run dev` entrypoint that adds a `--db` flag on top of Vite.
//
// Vite's CLI (`cac`) rejects unknown options, so `vite --db X` fails before
// `vite.config.ts` loads. We move `--db <path>` past Vite's `--` separator:
// `cac` then treats it as an inert positional, but it still arrives in
// `process.argv`, where `vite.config.ts` reads it and hands it to
// `attachSyncServer`. Everything else — including Vite's native `--port` —
// is forwarded to Vite unchanged. When the user passes no `--db`, we inject
// the dev store (`defaultDevDbPath()`, the platform user-data dir) explicitly
// so `vite.config.ts` always sees an intentional path. The dev store is
// separate from the production store (`data-prod.db`) so experimental dev
// runs never touch it.
//
//   bun run dev --port 5180 --strictPort                       # dev store (defaultDevDbPath())
//   bun run dev --db /tmp/localaction-demo.db --port 5180      # isolated throwaway store
//
// Vite itself is spawned as `bun --bun vite --configLoader runner`:
// `vite.config.ts` statically imports `server/index.ts` → `server/db.ts` →
// `bun:sqlite`, so every Vite process that loads the config must run under
// the Bun runtime.

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultDevDbPath } from '../server/db.ts';

// Split argv into Vite-native tokens and our `--db` token(s). The `--db` value
// is resolved to an absolute path and re-emitted after `--` so Vite ignores it
// while `vite.config.ts` can still read it from `process.argv`.
function rewriteArgv(argv: readonly string[]): string[] {
  const native: string[] = [];
  const dbTokens: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--db') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) {
        process.stderr.write('error: --db requires a path argument\n');
        process.exit(1);
      }
      dbTokens.push(`--db=${resolve(next)}`);
      i++;
    } else if (arg.startsWith('--db=')) {
      dbTokens.push(`--db=${resolve(arg.slice('--db='.length))}`);
    } else {
      native.push(arg);
    }
  }
  return [...native, '--', ...(dbTokens.length > 0 ? dbTokens : [`--db=${defaultDevDbPath()}`])];
}

const viteArgs = rewriteArgv(process.argv.slice(2));

// process.execPath is the Bun binary (this script runs via `bun scripts/dev.ts`).
// `--configLoader runner`: Vite's default config BUNDLER (rolldown) breaks
// `ws` upgrade handling under Bun — the bundled sync plugin accepts the
// socket server-side but its 101 response never reaches the wire. The
// native module runner skips bundling and the handshake works.
const viteBin = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules',
  'vite',
  'bin',
  'vite.js',
);
const result = spawnSync(
  process.execPath,
  ['--bun', viteBin, '--configLoader', 'runner', ...viteArgs],
  { stdio: 'inherit' },
);
if (result.error) {
  process.stderr.write(`error: failed to launch vite: ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
