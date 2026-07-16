// `pnpm dev` entrypoint that adds a `--db` flag on top of Vite.
//
// Vite's CLI (`cac`) rejects unknown options, so `vite --db X` fails before
// `vite.config.ts` loads. We move `--db <path>` past Vite's `--` separator:
// `cac` then treats it as an inert positional, but it still arrives in
// `process.argv`, where `vite.config.ts` reads it and hands it to
// `attachSyncServer`. Everything else — including Vite's native `--port` —
// is forwarded to Vite unchanged.
//
//   pnpm dev --db ./data/dev.db --port 5180 --strictPort

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// Split argv into Vite-native tokens and our `--db` token(s). The `--db` value
// is resolved to an absolute path and re-emitted after `--` so Vite ignores it
// while `vite.config.ts` can still read it from `process.argv`.
function rewriteArgv(argv: readonly string[]): string[] {
  const native: string[] = [];
  const dbTokens: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
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
  return dbTokens.length > 0 ? [...native, '--', ...dbTokens] : native;
}

const viteArgs = rewriteArgv(process.argv.slice(2));

const result = spawnSync('vite', viteArgs, { stdio: 'inherit' });
if (result.error) {
  process.stderr.write(`error: failed to launch vite: ${result.error.message}\n`);
  process.exit(1);
}
process.exit(result.status ?? 1);
