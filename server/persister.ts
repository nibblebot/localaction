/**
 * Server-side SQLite persistence: tabular saving.
 *
 * One SQL table per TinyBase table (identity mapping — SQL table name ===
 * store table id), one column per cell, so the database is inspectable and
 * queryable with normal SQL tooling. Row ids live in the TinyBase-default
 * `_id` column (no writer ever sets an `id` cell, so there is no collision).
 *
 * Load-bearing constraint: tabular mode does not work with a MergeableStore
 * (DpcTabular requires a regular Store; against a MergeableStore autosave
 * silently writes nothing and reload returns garbage), but `createWsServer`
 * syncs the store returned by `persister.getStore()`, which must stay the
 * MergeableStore. Hence the plain-Store mirror bridge in
 * `createServerPersister`: a tabular persister attached to a plain Store
 * that mirrors the sync MergeableStore; the facade exposes the mergeable
 * store via `getStore()` but loads/saves through the mirror.
 *
 * If a future tinybase upgrade makes tabular + MergeableStore work (or
 * changes `createWsServer`'s persister contract), this module is the single
 * seam to simplify — do not scatter the workaround.
 */
import { createStore, type MergeableStore, type Store, type Tables } from 'tinybase';
import {
  createSqlite3Persister,
  type Sqlite3Persister,
} from 'tinybase/persisters/persister-sqlite3';
import { TABLES } from '../src/data/schema.ts';
import { row } from '../src/data/internal.ts';
import { reconcileSchemaVersion } from '../src/data/schemaVersion.ts';
import type { ServerDatabase } from './db.ts';

/**
 * The key/value table holding the `schemaVersion` value. Named explicitly
 * (not `values`) because `VALUES` is a SQLite keyword and breaks ad-hoc
 * `SELECT * FROM values` queries.
 */
export const VALUES_TABLE_NAME = 'tinybase_values';

// Identity mapping in both directions (SQL table name === store table id)
// for every table in the app schema. `TABLES` is the single source — do not
// hand-list table names here.
const TABLE_NAMES = Object.values(TABLES);
const IDENTITY = Object.fromEntries(TABLE_NAMES.map((n) => [n, n]));
const TABULAR_CONFIG = {
  mode: 'tabular',
  tables: { load: IDENTITY, save: IDENTITY },
  // `values: {load: true, save: true}` is REQUIRED, not optional:
  // `reconcileSchemaVersion` decides the ADR-0001 wipe from the persisted
  // `schemaVersion` value; without persisting values, every server restart
  // would read `undefined` and wipe the entire database.
  values: { load: true, save: true, tableName: VALUES_TABLE_NAME },
} as const;

const onIgnoredError = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[srv persister] ignored error: ${message}\n`);
};

/**
 * A tabular SQLite persister for a plain Store. Used directly by
 * smoke/integration probes and by the facade in `createServerPersister`.
 * The `onIgnoredError` handler keeps tabular save failures from vanishing
 * silently (the old server passed no handler at all).
 */
export function createServerTabularPersister(
  store: Store,
  db: ServerDatabase,
): Sqlite3Persister {
  return createSqlite3Persister(store, db, TABULAR_CONFIG, undefined, onIgnoredError);
}

/**
 * SQLite has no per-row column absence: rows missing an optional cell read
 * back NULL and TinyBase loads them as dense `null` cells (e.g. an area
 * without `parentId` reloads with `parentId: null` instead of absent).
 * Dense nulls would sync to all clients, so they are stripped on load via
 * the data layer's existing null-stripper, keeping the in-memory store
 * sparse — exactly today's behavior.
 */
function cleanTables(tables: Tables): Tables {
  const out: Tables = {};
  for (const [tableId, rows] of Object.entries(tables)) {
    const cleanRows: Tables[string] = {};
    for (const [rowId, cells] of Object.entries(rows)) {
      // TinyBase's `Cell` type is wider (allows arbitrary objects) than the
      // primitives this app writes; `row()` only filters null/undefined.
      cleanRows[rowId] = row(
        cells as Record<string, string | number | boolean | null | undefined>,
      );
    }
    out[tableId] = cleanRows;
  }
  return out;
}

/**
 * The facade returned to `createWsServer`'s persister factory: exposes the
 * mergeable sync store via `getStore()` but loads/saves through a plain
 * Store mirror bridged from it.
 */
export function createServerPersister(
  store: MergeableStore,
  db: ServerDatabase,
): Sqlite3Persister {
  const mirror = createStore();
  const p = createServerTabularPersister(mirror, db);

  // Bridge: row-level diff per finished transaction.
  //
  // The previous design called `mirror.setContent(store.getContent())`,
  // which lets TinyBase diff and save incrementally. That fails at scale:
  // the tabular SQLite persister builds one `INSERT INTO t VALUES (...),(...)…`
  // per table per save, and SQLite caps bound parameters per statement at
  // 999 (`SQLITE_RANGE: column index out of range`). A tasks table with
  // 9 columns tops out around 110 rows per save — beyond that, every save
  // is silently dropped (`onIgnoredError` logs it; data is lost on restart).
  //
  // We bridge per-row instead. Each `setRow` / `delRow` on the mirror
  // produces a small per-row statement on the next save; bound params
  // stay under 999 regardless of table size. Verified: a 10k-task seeding
  // transaction persists intact and reloads with all rows present.
  const bridgeId = store.addDidFinishTransactionListener(() => {
    const [nextTables, nextValues] = store.getContent();
    // Values are tiny (single key/value table) — a bulk write is fine.
    mirror.setValues(nextValues);
    const prevTables = mirror.getTables();
    for (const tableId of Object.keys(prevTables)) {
      if (!(tableId in nextTables)) mirror.delTable(tableId);
    }
    for (const [tableId, nextRows] of Object.entries(nextTables)) {
      const prevRows = prevTables[tableId] ?? {};
      // Deletions first — a row replaced wholesale should appear as a
      // single fresh insert, not a delete + insert pair.
      for (const rowId of Object.keys(prevRows)) {
        if (!(rowId in nextRows)) mirror.delRow(tableId, rowId);
      }
      for (const [rowId, row] of Object.entries(nextRows)) {
        mirror.setRow(tableId, rowId, row);
      }
    }
  });

  const startAutoLoad = async (
    initialContent?: unknown,
  ): Promise<Sqlite3Persister> => {
    // `createWsServer` calls `startAutoLoad()` on the persister it receives.
    // The SQLite persister's autoload subscribes to the underlying database's
    // `CHANGE` event, which fires for our own writes too. That callback chain
    // ends in the WS server's `load()` → `getChangesFromOtherStore()`, which
    // would overwrite just-saved state with whatever stale view a client has.
    // We still want the initial `load(initialContent)` so a freshly-spawned
    // server client restores persisted state from SQLite, but we must skip
    // the CHANGE-event autoload registration that would otherwise fire on
    // every one of our own writes. The server is the sole writer; client
    // updates arrive as WS `ContentDiff` messages handled by the WS server's
    // own autoLoad path.
    await p.load(initialContent as Parameters<Sqlite3Persister['load']>[0]);
    store.setContent([cleanTables(mirror.getTables()), mirror.getValues()]);
    // Clean-cutover wipe AFTER load: the persister just read the old SQLite
    // snapshot; reconcileSchemaVersion drops every row whose recorded version
    // differs and stamps the current one. ADR-0001. The wipe flows through
    // the bridge into the mirror, and the WS server calls `startAutoSave()`
    // (forwarded by the spread) immediately after `startAutoLoad()`, whose
    // initial full save persists the post-reconcile state.
    reconcileSchemaVersion(store);
    return facade;
  };

  const destroy = async (): Promise<Sqlite3Persister> => {
    // `createWsServer` destroys the persister when a path's last client
    // disconnects; the bridge listener must not leak.
    store.delListener(bridgeId);
    await p.destroy();
    return facade;
  };

  const facade: Sqlite3Persister = {
    ...p,
    // CRITICAL override: bare `...p` would expose the plain mirror and the
    // WS server would try to sync a non-mergeable store.
    getStore: () => store,
    startAutoLoad,
    destroy,
    // startAutoSave/stopAutoSave/save/load/getDb etc. are forwarded
    // unchanged by the spread.
  };
  return facade;
}

/**
 * Removes the orphaned JSON-mode `tinybase` table on cutover to tabular
 * saving. Idempotent (`IF EXISTS`).
 */
export async function dropLegacyJsonTable(db: ServerDatabase): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  db.exec('DROP TABLE IF EXISTS tinybase', (err: Error | null) =>
    err ? reject(err) : resolve(),
  );
  await promise;
}
