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
import type { Database as Sqlite3Database } from 'sqlite3';

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
  const { promise, resolve, reject } = Promise.withResolvers<ServerDatabase>();
  const db = new sqlite3.Database(file, mode, (err: Error | null) => {
    if (err) reject(err);
    else resolve(db);
  });
  return promise;
}
