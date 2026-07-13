/**
 * Tiny sqlite3-shaped adapter over Bun's built-in `bun:sqlite`.
 *
 * Why this exists: the TinyBase `createSqlite3Persister` consumes a
 * `sqlite3#Database`-shaped value (callback-style `.all`, event-emitter
 * `.on/.off`, `.close(cb)`), but `@localaction/server` should run under
 * a `bun build --compile` binary. The `sqlite3` npm package is a Node
 * NAPI addon that calls libuv's `uv_async_init`; Bun on POSIX doesn't
 * polyfill libuv (https://github.com/oven-sh/bun/issues/18546), so that
 * addon aborts at load time. `bun:sqlite` is built into the runtime and
 * has no NAPI dependency, so this adapter is the only sqlite path the
 * server uses.
 *
 * The TinyBase `persister-sqlite3/index.d.ts` declares
 *   `db: Database` where `Database` is `import type { Database } from 'sqlite3'`.
 * We extend that exact interface so the structural check at
 * `createSqlite3Persister(store, db)` is satisfied without a cast.
 * The runtime `Adapter` class only implements `.all` and `.close` (the
 * methods TinyBase actually invokes in this server's `load()` path);
 * listener methods come from the `EventEmitter` base class; the rest
 * of the inherited `Database` surface is never called.
 *
 * `bun:sqlite` exposes a synchronous `Database#query` returning a
 * `Statement` whose `.all(...params)` returns the rows; we funnel both
 * happy-path and error into the callback via `queueMicrotask` to keep
 * the async semantics TinyBase expects.
 */
import { Database } from 'bun:sqlite';
import { EventEmitter } from 'node:events';
import type { Database as Sqlite3Database } from 'sqlite3';

export interface ServerDatabase extends Sqlite3Database {
  // Inherits the full structural shape TinyBase expects. `run`,
  // `get`, `each`, `prepare`, etc. all exist on the interface but
  // are never invoked by the server's persister code path.
}

export interface OpenOptions {
  readonly?: boolean;
}

interface BunStmt {
  all(...params: unknown[]): unknown[];
}

interface BunSqliteHandle {
  query(sql: string): BunStmt;
  close(): void;
}

function createAdapter(file: string, opts: OpenOptions): ServerDatabase {
  // Note on Bun 1.3.14: the options-arg form `new Database(file, {
  // readonly: opts.readonly })` is declared in the `bun:sqlite` typings
  // and accepts `:memory:` targets with `readonly: true`, but for file
  // paths on this release it raises `SQLITE_MISUSE` (errno 21) at
  // construction time. Until that's fixed upstream, open with a single
  // argument. The `readonly` option is accepted by `openDatabase` for
  // API symmetry but is not enforced server-side — to get a true
  // read-only handle today, write through a separate file or open a
  // SQLite URI form once `bun:sqlite` supports it.
  void opts;
  const inner: BunSqliteHandle = new Database(file);

  // `Adapter` extends `EventEmitter` so it satisfies the `on/off/once`
  // /`addListener`/etc. surface that `Sqlite3Database` inherits from
  // `events.EventEmitter`. Only `.all` and `.close` have non-trivial
  // bodies; the rest of `Database`'s API exists for type compatibility
  // but is never called from the server's code path.
  class Adapter extends EventEmitter {
    all(
      sql: string,
      paramsOrCb:
        | unknown[]
        | ((err: Error | null, rows: unknown[]) => void),
      maybeCb?: (err: Error | null, rows: unknown[]) => void,
    ): void {
      const cb =
        typeof paramsOrCb === 'function'
          ? paramsOrCb
          : (maybeCb as (err: Error | null, rows: unknown[]) => void);
      const params: unknown[] = Array.isArray(paramsOrCb) ? paramsOrCb : [];
      try {
        const stmt = inner.query(sql);
        const rows = stmt.all(...params) as unknown[];
        queueMicrotask(() => cb(null, rows));
      } catch (err) {
        queueMicrotask(() => cb(err as Error, []));
      }
    }

    close(cb: (err: Error | null) => void): void {
      try {
        inner.close();
        queueMicrotask(() => cb(null));
      } catch (err) {
        queueMicrotask(() => cb(err as Error));
      }
    }
  }

  // A `private constructor` would be cleaner here but is forbidden by
  // `erasableSyntaxOnly`. The runtime `Adapter` instance satisfies the
  // listener surface via its `EventEmitter` base class and the
  // `.all`/`.close` contract via the methods above; the remaining
  // `Database` surface is provided by structural assignment through
  // the cast.
  return new Adapter() as unknown as ServerDatabase;
}

export async function openDatabase(
  file: string,
  opts: OpenOptions = {},
): Promise<ServerDatabase> {
  // Construction is synchronous and never fails on a missing file
  // (sqlite creates it on first write); wrapping in `Promise.resolve`
  // keeps the call sites that already `await openDatabase(...)`
  // unchanged.
  return createAdapter(file, opts);
}
