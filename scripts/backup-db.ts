// `pnpm backup-db` — online backup of the server's SQLite store.
//
//   pnpm backup-db                                # defaultDbPath() → timestamped sibling
//   pnpm backup-db --db /tmp/localaction-test-x.db --out ./backups/snapshot.db
//
// Uses SQLite's online backup form `VACUUM INTO`: the copy runs inside a
// read transaction on the source, so a running `pnpm dev` / `pnpm start`
// server keeps serving (and writing) while the backup is taken — the result
// is a consistent snapshot as of backup start, never a torn file. As a bonus
// the destination comes out fully compacted.
//
// Safety rules:
// - The source is opened READ-ONLY, so the backup can never mutate the store.
// - The destination must not already exist as a non-empty file (SQLite
//   rejects that too, but we fail fast with a clearer message). Backups are
//   never overwritten — pass a fresh `--out` or remove the old file yourself.

import { existsSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { openDatabase, defaultDbPath } from '../server/db.ts';

interface CliArgs {
  dbPath: string;
  outPath?: string;
  help: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const out: CliArgs = { dbPath: defaultDbPath(), help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--db') {
      const next = argv[++i];
      if (next) out.dbPath = next;
    } else if (arg.startsWith('--db=')) {
      out.dbPath = arg.slice('--db='.length);
    } else if (arg === '--out') {
      const next = argv[++i];
      if (next) out.outPath = next;
    } else if (arg.startsWith('--out=')) {
      out.outPath = arg.slice('--out='.length);
    } else if (arg === '-h' || arg === '--help') {
      out.help = true;
    }
  }
  return out;
}

function printUsage(stream: NodeJS.WriteStream): void {
  stream.write(
    'Usage: pnpm backup-db [--db <path>] [--out <path>]\n' +
      '\n' +
      'Back up the SQLite store of a running (or stopped) localaction server\n' +
      'using SQLite online backup (VACUUM INTO). Safe while the server is live.\n' +
      '\n' +
      `  --db <path>    SQLite file to back up. Default: ${defaultDbPath()}\n` +
      '  --out <path>   Destination file. Default: <db dir>/<db name>.backup-<timestamp>.db\n' +
      '  -h, --help     Show this help and exit.\n',
  );
}

// Filesystem-safe timestamp: 2026-07-20T12-34-56-789Z
function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function defaultOutPath(dbPath: string): string {
  const dir = dirname(dbPath);
  const base = basename(dbPath).replace(/\.db$/, '');
  return join(dir, `${base}.backup-${timestamp()}.db`);
}

// `VACUUM INTO '<path>'` — single-quote escaping is the only interpolation
// needed for a string literal in SQLite.
function sqlStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    printUsage(process.stdout);
    return;
  }

  const dbPath = resolve(cli.dbPath);
  const outPath = resolve(cli.outPath ?? defaultOutPath(dbPath));

  if (!existsSync(dbPath)) {
    process.stderr.write(`error: source database not found: ${dbPath}\n`);
    process.exit(1);
  }
  if (outPath === dbPath) {
    process.stderr.write('error: --out must differ from --db\n');
    process.exit(1);
  }
  if (existsSync(outPath) && statSync(outPath).size > 0) {
    process.stderr.write(
      `error: destination already exists (refusing to overwrite): ${outPath}\n`,
    );
    process.exit(1);
  }

  // Read-only: VACUUM INTO only reads the source (SQLite supports it on
  // read-only connections), so a live server's locks are the only contention.
  // busyTimeout from openDatabase covers the brief read-lock overlap.
  const db = await openDatabase(dbPath, { readonly: true });
  try {
    await new Promise<void>((res, rej) => {
      db.exec(`VACUUM INTO ${sqlStringLiteral(outPath)}`, (err: Error | null) =>
        err ? rej(err) : res(),
      );
    });
  } finally {
    await new Promise<void>((res) => db.close(() => res()));
  }

  const size = statSync(outPath).size;
  process.stdout.write(
    `[backup-db] ${dbPath} -> ${outPath} (${(size / 1024).toFixed(1)} KiB)\n`,
  );
}

main().then(
  () => {},
  (err) => {
    process.stderr.write(
      `error: backup failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  },
);
