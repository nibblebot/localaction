import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createMergeableStore, createStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { openDatabase } from '../server/db.ts';
import {
  createServerTabularPersister,
  VALUES_TABLE_NAME,
} from '../server/persister.ts';
import {
  createWsSynchronizer,
} from 'tinybase/synchronizers/synchronizer-ws-client';
import { startServer } from '../server/index.ts';

const PORT = 5190 + Math.floor(Math.random() * 100);
const DB_PATH = join(tmpdir(), `localaction-smoke-${Date.now()}.db`);
const WS_URL = `ws://localhost:${PORT}/ws`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`smoke: ${message}`);
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const { promise: timeout, reject: timeoutReject } =
    Promise.withResolvers<T>();
  timer = setTimeout(() => timeoutReject(new Error(`timeout: ${label}`)), ms);
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const server = await startServer({ port: PORT, dbPath: DB_PATH });
  console.log(`smoke: server up on :${server.port}, db=${DB_PATH}`);

  try {
    const a = createMergeableStore();
    const b = createMergeableStore();

    const syncA = await withTimeout(
      createWsSynchronizer(a, new WebSocket(WS_URL)),
      5000,
      'syncA connect',
    );
    const syncB = await withTimeout(
      createWsSynchronizer(b, new WebSocket(WS_URL)),
      5000,
      'syncB connect',
    );
    await syncA.startSync();
    await syncB.startSync();
    console.log('smoke: both clients connected');

    a.setCell('areas', 'd1', 'name', 'Family');
    a.setCell('areas', 'd1', 'createdAt', '2026-01-01T00:00:00Z');
    a.setCell('areas', 'd2', 'name', 'Health');
    a.setCell('areas', 'd2', 'parentId', 'd1');

    await withTimeout(
      waitForCell(b, 'areas', 'd1', 'name', 'Family'),
      5000,
      'sync A→B',
    );
    console.log('smoke: write A replicated to B');

    b.setCell('projects', 'p1', 'areaId', 'd1');
    b.setCell('projects', 'p1', 'name', 'Plan vacation');
    await withTimeout(
      waitForCell(a, 'projects', 'p1', 'name', 'Plan vacation'),
      5000,
      'sync B→A',
    );
    console.log('smoke: write B replicated to A');

    await waitForPersisted(DB_PATH, 'projects', 'p1', 'name', 'Plan vacation');
    console.log('smoke: writes persisted to SQLite');

    // Direct proof of tabular mode: the project row lives in a per-entity
    // `projects` SQL table keyed by `_id`, not in a JSON blob.
    const rawDb = openDatabase(DB_PATH, { readonly: true });
    const projectRows = rawDb
      .query("SELECT name FROM projects WHERE _id = 'p1'")
      .all() as Array<{ name: string }>;
    assert(
      projectRows.length === 1 && projectRows[0]!.name === 'Plan vacation',
      `tabular SELECT from projects did not return the p1 row (got ${JSON.stringify(projectRows)})`,
    );
    const tableNames = (
      rawDb.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string;
      }>
    ).map((r) => r.name);
    for (const expected of ['areas', 'projects', VALUES_TABLE_NAME]) {
      assert(
        tableNames.includes(expected),
        `tabular tables missing ${expected} (have: ${tableNames.join(', ')})`,
      );
    }
    rawDb.close();
    console.log('smoke: raw SQL confirms tabular tables (areas, projects, values)');
    await syncA.destroy();
    await syncB.destroy();

    const fresh = createMergeableStore();
    const freshSync = await withTimeout(
      createWsSynchronizer(fresh, new WebSocket(WS_URL)),
      5000,
      'fresh connect',
    );
    await freshSync.startSync();
    console.log('smoke: fresh sync started');
    await withTimeout(
      waitForCell(fresh, 'areas', 'd1', 'name', 'Family'),
      5000,
      'fresh persist load',
    );
    console.log('smoke: fresh observed initial area');
    await withTimeout(
      waitForCell(fresh, 'projects', 'p1', 'name', 'Plan vacation'),
      5000,
      'fresh project load',
    );
    await withTimeout(
      waitForCell(fresh, 'areas', 'd2', 'parentId', 'd1'),
      5000,
      'fresh sub-area load',
    );
    console.log('smoke: fresh client loaded persisted state');
    await freshSync.destroy();

    const reload = createStore();
    const reloadDb = await openDatabase(DB_PATH, { readonly: true });
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
      reload.getCell('projects', 'p1', 'name') === 'Plan vacation',
      'persister.load() did not return projects/p1/name',
    );
    console.log(
      'smoke: persister.load() round-trips Area, Sub-Area, and Project rows',
    );
  } finally {
    await server.close();
    try {
      unlinkSync(DB_PATH);
    } catch {
    }
  }
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

main().then(
  () => {
    console.log('smoke: OK');
    process.exit(0);
  },
  (err) => {
    console.error('smoke: FAIL', err);
    process.exit(1);
  },
);
