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
import { basename, dirname, join } from 'node:path';
import envPaths from 'env-paths';
import { logInfo } from '../src/log.ts';

// The user's real stores live in the platform user-data directory, not the
// repo: `~/.local/share/localaction/data-dev.db` / `data-prod.db` /
// `data-preview.db` (Linux, honoring XDG_DATA_HOME),
// `%LOCALAPPDATA%\localaction\Data\data-dev.db` / `data-prod.db` /
// `data-preview.db` (Windows), `~/Library/Application Support/localaction/…`
// (macOS). `suffix: ''` drops env-paths' default `-nodejs` suffix.
//
// Dev, prod, and preview get separate files so an experimental
// `bun run dev` or `bun run preview` session never shares state with the
// production store: `defaultDevDbPath()` is the `bun run dev` default;
// `defaultProdDbPath()` is the `bun run prod` / `bun run backup-db` default;
// `defaultPreviewDbPath()` is the `bun run preview` default. A pre-split
// `data.db` from older versions is left untouched — nothing reads, migrates,
// or deletes it. Entry points pass the path explicitly; the server API
// itself has no default, so tests/smoke are forced to name their own
// throwaway path.
export function defaultDevDbPath(): string {
  return join(envPaths('localaction', { suffix: '' }).data, 'data-dev.db');
}

export function defaultProdDbPath(): string {
  return join(envPaths('localaction', { suffix: '' }).data, 'data-prod.db');
}

export function defaultPreviewDbPath(): string {
  const prod = defaultProdDbPath();
  return join(dirname(prod), basename(prod).replace('prod', 'preview'));
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
