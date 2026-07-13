import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { createSqlite3Persister } from 'tinybase/persisters/persister-sqlite3';
import { openDatabase } from '../server/db.ts';
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

    a.setCell('domains', 'd1', 'name', 'Family');
    a.setCell('domains', 'd1', 'createdAt', '2026-01-01T00:00:00Z');
    a.setCell('domains', 'd2', 'name', 'Health');
    a.setCell('domains', 'd2', 'parentId', 'd1');

    await withTimeout(
      waitForCell(b, 'domains', 'd1', 'name', 'Family'),
      5000,
      'sync A→B',
    );
    console.log('smoke: write A replicated to B');

    b.setCell('projects', 'p1', 'domainId', 'd1');
    b.setCell('projects', 'p1', 'name', 'Plan vacation');
    await withTimeout(
      waitForCell(a, 'projects', 'p1', 'name', 'Plan vacation'),
      5000,
      'sync B→A',
    );
    console.log('smoke: write B replicated to A');

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
      waitForCell(fresh, 'domains', 'd1', 'name', 'Family'),
      5000,
      'fresh persist load',
    );
    console.log('smoke: fresh observed initial domain');
    assert(
      fresh.getCell('projects', 'p1', 'name') === 'Plan vacation',
      'fresh client did not see persisted project',
    );
    assert(
      fresh.getCell('domains', 'd2', 'parentId') === 'd1',
      'fresh client did not see persisted sub-domain relation',
    );
    console.log('smoke: fresh client loaded persisted state');
    await freshSync.destroy();

    const reload = createMergeableStore();
    const reloadDb = await openDatabase(DB_PATH, { readonly: true });
    const reloadPersister = createSqlite3Persister(reload, reloadDb);
    await reloadPersister.load();
    assert(
      reload.getCell('domains', 'd1', 'name') === 'Family',
      'persister.load() did not return domains/d1/name',
    );
    assert(
      reload.getCell('domains', 'd2', 'parentId') === 'd1',
      'persister.load() did not return domains/d2/parentId (sub-domain)',
    );
    assert(
      reload.getCell('projects', 'p1', 'name') === 'Plan vacation',
      'persister.load() did not return projects/p1/name',
    );
    console.log(
      'smoke: persister.load() round-trips Domain, Sub-Domain, and Project rows',
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
