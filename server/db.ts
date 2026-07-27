/**
 * Opens a `sqlite3` database connection for TinyBase's
 * `createSqlite3Persister`. One connection is shared process-wide
 * (see `server/index.ts`).
 *
 * The `sqlite3` npm package is CommonJS-only. Its `.d.ts` declares
 * named exports for typings, but the runtime shape is on
 * `module.exports` (Node's ESM loader rejects the named-import form
 * for this module). To get the runtime values under
 * `verbatimModuleSyntax: true`, we go through `createRequire` —
 * that resolves once, gives us the full CJS namespace, and
 * preserves the `import type` ergonomics for the rest of the
 * codebase.
 *
 * Once loaded, the real `Database` class already exposes the
 * callback-style API (`all`, `get`, `run`, `exec`, `close`, plus the
 * `EventEmitter` listener surface) that `createSqlite3Persister`
 * expects — no adapter layer is needed.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import envPaths from 'env-paths';
import type { Database as Sqlite3Database } from 'sqlite3';

// The user's real store lives in the platform user-data directory, not the
// repo: `~/.local/share/localaction/data.db` (Linux, honoring XDG_DATA_HOME),
// `%LOCALAPPDATA%\localaction\Data\data.db` (Windows),
// `~/Library/Application Support/localaction/data.db` (macOS). `suffix: ''`
// drops env-paths' default `-nodejs` suffix. Entry points (`pnpm dev`,
// `pnpm start`) pass this explicitly; the server API itself has no default,
// so tests/smoke are forced to name their own throwaway path.
export function defaultDbPath(): string {
  return join(envPaths('localaction', { suffix: '' }).data, 'data.db');
}

const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3') as {
  Database: typeof Sqlite3Database;
  OPEN_CREATE: number;
  OPEN_READONLY: number;
  OPEN_READWRITE: number;
};

export type ServerDatabase = Sqlite3Database;

export interface OpenOptions {
  readonly?: boolean;
}

export function openDatabase(
  file: string,
  opts: OpenOptions = {},
): Promise<ServerDatabase> {
  const mode = opts.readonly
    ? sqlite3.OPEN_READONLY
    : sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;
  if (!opts.readonly) {
    mkdirSync(dirname(file), { recursive: true });
  }
  const { promise, resolve, reject } = Promise.withResolvers<ServerDatabase>();
  const db = new sqlite3.Database(file, mode, (err: Error | null) => {
    if (err) reject(err);
    else {
      // Retry on SQLITE_BUSY for up to 5s instead of failing fast. Without
      // this, a concurrent reader (another connection, a backup, a probe)
      // holding a shared lock makes a writer's COMMIT return BUSY at once —
      // silently dropping the write (e.g. TinyBase autoSave losing rows).
      db.configure('busyTimeout', 5_000);
      resolve(db);
    }
  });
  return promise;
}
