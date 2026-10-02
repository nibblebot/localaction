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
  createSqliteBunPersister,
  type SqliteBunPersister,
} from 'tinybase/persisters/persister-sqlite-bun';
import { TABLES } from '../src/data/schema.ts';
import { row } from '../src/data/internal.ts';
import type { ServerDatabase } from './db.ts';

// Identity mapping in both directions (SQL table name === store table id)
// for every table in the app schema. `TABLES` is the single source — do not
// hand-list table names here.
const TABLE_NAMES = Object.values(TABLES);
const IDENTITY = Object.fromEntries(TABLE_NAMES.map((n) => [n, n]));
const TABULAR_CONFIG = {
  mode: 'tabular',
  tables: { load: IDENTITY, save: IDENTITY },
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
export function createServerTabularPersister(store: Store, db: ServerDatabase): SqliteBunPersister {
  return createSqliteBunPersister(store, db, TABULAR_CONFIG, undefined, onIgnoredError);
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
      cleanRows[rowId] = row(cells as Record<string, string | number | boolean | null | undefined>);
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
): SqliteBunPersister {
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

  const startAutoLoad = async (initialContent?: unknown): Promise<SqliteBunPersister> => {
    // `createWsServer` calls `startAutoLoad()` on the persister it receives.
    // We still want the initial `load(initialContent)` so a freshly-spawned
    // server client restores persisted state from SQLite, but we skip the
    // change-feed autoload registration (under the old sqlite3 driver it
    // fired on our own writes and fed stale client state back over them;
    // the bun:sqlite persister has no change feed at all). The server is
    // the sole writer; client updates arrive as WS `ContentDiff` messages
    // handled by the WS server's own autoLoad path.
    await p.load(initialContent as Parameters<SqliteBunPersister['load']>[0]);
    store.setContent([cleanTables(mirror.getTables()), mirror.getValues()]);
    return facade;
  };

  const destroy = async (): Promise<SqliteBunPersister> => {
    // `createWsServer` destroys the persister when a path's last client
    // disconnects; the bridge listener must not leak.
    store.delListener(bridgeId);
    await p.destroy();
    return facade;
  };

  const facade: SqliteBunPersister = {
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
  db.exec('DROP TABLE IF EXISTS tinybase');
}
