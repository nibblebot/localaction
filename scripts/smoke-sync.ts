// Shared sync/persistence assertions for the smoke scripts (`scripts/smoke.ts`
// drives `startServer` from source; `scripts/smoke-bundle.ts` drives the
// packaged daemon). Takes an already-listening server's WS URL + DB path and
// proves two clients converge through it and the writes land in SQLite.
import { WebSocket } from 'ws';
import { createMergeableStore, createStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';
import { openDatabase } from '../server/db.ts';
import { createServerTabularPersister } from '../server/persister.ts';

export interface SmokeTarget {
  wsUrl: string;
  dbPath: string;
  label: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const { promise: timeout, reject: timeoutReject } = Promise.withResolvers<T>();
  timer = setTimeout(() => timeoutReject(new Error(`timeout: ${label}`)), ms);
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function assertSyncConvergence(target: SmokeTarget): Promise<void> {
  const { wsUrl, dbPath, label } = target;
  const a = createMergeableStore();
  const b = createMergeableStore();

  const syncA = await withTimeout(
    createWsSynchronizer(a, new WebSocket(wsUrl)),
    5000,
    'syncA connect',
  );
  const syncB = await withTimeout(
    createWsSynchronizer(b, new WebSocket(wsUrl)),
    5000,
    'syncB connect',
  );
  await syncA.startSync();
  await syncB.startSync();
  console.log(`${label}: both clients connected`);

  a.setCell('areas', 'd1', 'name', 'Family');
  a.setCell('areas', 'd1', 'createdAt', '2026-01-01T00:00:00Z');
  a.setCell('areas', 'd2', 'name', 'Health');
  a.setCell('areas', 'd2', 'parentId', 'd1');

  await withTimeout(waitForCell(b, 'areas', 'd1', 'name', 'Family'), 5000, 'sync A→B');
  console.log(`${label}: write A replicated to B`);

  b.setCell('tasks', 't1', 'placement', 'area:d1');
  b.setCell('tasks', 't1', 'title', 'Plan vacation');
  await withTimeout(waitForCell(a, 'tasks', 't1', 'title', 'Plan vacation'), 5000, 'sync B→A');
  console.log(`${label}: write B replicated to A`);

  await waitForPersisted(dbPath, 'tasks', 't1', 'title', 'Plan vacation');
  console.log(`${label}: writes persisted to SQLite`);

  // Direct proof of tabular mode: the task row lives in a per-entity
  // `tasks` SQL table keyed by `_id`, not in a JSON blob.
  const rawDb = openDatabase(dbPath, { readonly: true });
  const taskRows = rawDb.query("SELECT title FROM tasks WHERE _id = 't1'").all() as Array<{
    title: string;
  }>;
  assert(
    taskRows.length === 1 && taskRows[0]!.title === 'Plan vacation',
    `tabular SELECT from tasks did not return the t1 row (got ${JSON.stringify(taskRows)})`,
  );
  const tableNames = (
    rawDb.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
      name: string;
    }>
  ).map((r) => r.name);
  for (const expected of ['areas', 'tasks']) {
    assert(
      tableNames.includes(expected),
      `tabular tables missing ${expected} (have: ${tableNames.join(', ')})`,
    );
  }
  rawDb.close();
  console.log(`${label}: raw SQL confirms tabular tables (areas, tasks)`);
  await syncA.destroy();
  await syncB.destroy();

  const fresh = createMergeableStore();
  const freshSync = await withTimeout(
    createWsSynchronizer(fresh, new WebSocket(wsUrl)),
    5000,
    'fresh connect',
  );
  await freshSync.startSync();
  console.log(`${label}: fresh sync started`);
  await withTimeout(
    waitForCell(fresh, 'areas', 'd1', 'name', 'Family'),
    5000,
    'fresh persist load',
  );
  console.log(`${label}: fresh observed initial area`);
  await withTimeout(
    waitForCell(fresh, 'tasks', 't1', 'title', 'Plan vacation'),
    5000,
    'fresh task load',
  );
  await withTimeout(
    waitForCell(fresh, 'areas', 'd2', 'parentId', 'd1'),
    5000,
    'fresh sub-area load',
  );
  console.log(`${label}: fresh client loaded persisted state`);
  await freshSync.destroy();

  const reload = createStore();
  const reloadDb = await openDatabase(dbPath, { readonly: true });
  const reloadPersister = createServerTabularPersister(reload, reloadDb);
  await reloadPersister.load();
  assert(
    reload.getCell('areas', 'd1', 'name') === 'Family',
    'persister.load() did not return areas/d1/name',
  );
  assert(
    reload.getCell('areas', 'd2', 'parentId') === 'd1',
    'persister.load() did not return areas/d2/parentId (sub-area)',
  );
  assert(
    reload.getCell('tasks', 't1', 'title') === 'Plan vacation',
    'persister.load() did not return tasks/t1/title',
  );
  console.log(`${label}: persister.load() round-trips Area, Sub-Area, and Task rows`);
}

async function waitForCell(
  store: MergeableStore,
  table: string,
  row: string,
  cell: string,
  value: unknown,
): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (store.getCell(table, row, cell) === value) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `timeout waiting for ${table}.${row}.${cell} to equal ${JSON.stringify(value)} (got ${JSON.stringify(store.getCell(table, row, cell))})`,
  );
}

// Confirm the server's autoSave flushed `cell` to SQLite before we disconnect
// the last client. TinyBase destroys a path's server store on last
// disconnect; a fresh client connecting afterwards reloads from SQLite, so
// without this guarantee that reload races autoSave and can miss the most
// recent writes. Polling the file is deterministic. (Real timers are
// intentional: the server's autoSave runs on its own clock with no completion
// event, so we poll the file — fake timers cannot observe another process's
// SQLite commits.)
async function waitForPersisted(
  file: string,
  table: string,
  row: string,
  cell: string,
  value: unknown,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const probe = createStore();
    const db = await openDatabase(file, { readonly: true });
    const persister = createServerTabularPersister(probe, db);
    try {
      await persister.load();
      if (probe.getCell(table, row, cell) === value) return;
    } catch {
      // transient SQLite lock while the server auto-saves; retry
    }
    await persister.destroy();
    db.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `timeout waiting for ${table}.${row}.${cell} to persist as ${JSON.stringify(value)}`,
  );
}
