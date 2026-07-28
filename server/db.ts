/**
 * Opens a `bun:sqlite` database connection for TinyBase's
 * `createSqliteBunPersister`. One connection is shared process-wide
 * (see `server/index.ts`).
 *
 * `bun:sqlite` is synchronous and already exposes the
 * `query(sql).all(...params)` shape the persister drives — no adapter
 * layer is needed. The module specifier only resolves under the Bun
 * runtime; every entry point that reaches this file (`bun scripts/dev.ts`,
 * `bun server/index.ts`, `bun --bun vite ...`, `bun test`) runs under Bun.
 */
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import envPaths from 'env-paths';
import { logInfo } from '../src/log.ts';

// The user's real store lives in the platform user-data directory, not the
// repo: `~/.local/share/localaction/data.db` (Linux, honoring XDG_DATA_HOME),
// `%LOCALAPPDATA%\localaction\Data\data.db` (Windows),
// `~/Library/Application Support/localaction/data.db` (macOS). `suffix: ''`
// drops env-paths' default `-nodejs` suffix. Entry points (`bun run dev`,
// `bun run start`) pass this explicitly; the server API itself has no default,
// so tests/smoke are forced to name their own throwaway path.
export function defaultDbPath(): string {
  return join(envPaths('localaction', { suffix: '' }).data, 'data.db');
}

export type ServerDatabase = Database;

export interface OpenOptions {
  readonly?: boolean;
}

export function openDatabase(file: string, opts: OpenOptions = {}): ServerDatabase {
  if (!opts.readonly) {
    mkdirSync(dirname(file), { recursive: true });
  }
  const db = new Database(file, {
    readonly: opts.readonly ?? false,
    create: !opts.readonly,
  });
  // Retry on SQLITE_BUSY for up to 5s instead of failing fast. Without
  // this, a concurrent reader (another connection, a backup, a probe)
  // holding a shared lock makes a writer's COMMIT return BUSY at once —
  // silently dropping the write (e.g. TinyBase autoSave losing rows).
  db.exec('PRAGMA busy_timeout = 5000');
  logInfo('persistence', `opened sqlite at ${file}${opts.readonly ? ' (readonly)' : ''}`);
  return db;
}
