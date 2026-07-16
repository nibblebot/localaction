// @vitest-environment node
/**
 * Sync-server round-trip integration test.
 *
 * Boots the same prod server that `pnpm start` uses, then connects two
 * TinyBase MergeableStores to it as if they were two browser tabs.
 * Asserts that:
 *
 *   1. Two clients can each start sync against the server.
 *   2. A write on one client's store replicates to the other.
 *   3. After both clients disconnect, a third "fresh" client sees the
 *      full persisted state (Area, Sub-Area, Project).
 *   4. The SQLite file round-trips through `createSqlite3Persister.load()`.
 *
 * Runs under vitest with `@vitest-environment node` (no DOM, real
 * `ws`/`sqlite3` Node modules).
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { createSqlite3Persister } from 'tinybase/persisters/persister-sqlite3';
import {
  createWsSynchronizer,
} from 'tinybase/synchronizers/synchronizer-ws-client';
import { startServer, type RunningServer } from '../../server/index.ts';
import { openDatabase } from '../../server/db.ts';

// TinyBase's public types don't name the synchronizer class returned by
// `createWsSynchronizer`; aliasing it here keeps callsites off the
// `Awaited<ReturnType<...>>` shape consumers used to reach for.
type WsSynchronizer = Awaited<ReturnType<typeof createWsSynchronizer>>;

let port: number;
let dbPath: string;
let server: RunningServer;
let url: string;

beforeAll(async () => {
  port = 5190 + Math.floor(Math.random() * 100);
  dbPath = join(
    tmpdir(),
    `localaction-integration-${Date.now()}-${process.pid}.db`,
  );
  url = `ws://localhost:${port}/ws`;
  server = await startServer({ port, dbPath });
});

afterAll(async () => {
  await server.close();
  try {
    unlinkSync(dbPath);
  } catch {
    /* file may already be gone */
  }
});

async function waitForCell(
  store: MergeableStore,
  table: string,
  row: string,
  cell: string,
  value: unknown,
  timeoutMs = 5_000,
): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const deadline = Date.now() + timeoutMs;
  const tick = (): void => {
    if (store.getCell(table, row, cell) === value) {
      resolve();
      return;
    }
    if (Date.now() > deadline) {
      reject(
        new Error(
          `timeout waiting for ${table}.${row}.${cell} to equal ${JSON.stringify(value)} ` +
            `(got ${JSON.stringify(store.getCell(table, row, cell))})`,
        ),
      );
      return;
    }
    setTimeout(tick, 50);
  };
  tick();
  return promise;
}

async function waitForRowAbsent(
  store: MergeableStore,
  table: string,
  row: string,
  timeoutMs = 5_000,
): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const deadline = Date.now() + timeoutMs;
  const tick = (): void => {
    if (!store.hasRow(table, row)) {
      resolve();
      return;
    }
    if (Date.now() > deadline) {
      reject(
        new Error(
          `timeout waiting for ${table}.${row} to be deleted (still present)`,
        ),
      );
      return;
    }
    setTimeout(tick, 50);
  };
  tick();
  return promise;
}

// Confirm the server's autoSave has flushed `cell` to SQLite. TinyBase
// destroys a path's server store when its last client disconnects; a fresh
// client connecting afterwards reloads from SQLite, so writes must be
// persisted BEFORE that disconnect — otherwise the reload races autoSave and
// can miss the most recent writes. Polling the file is deterministic.
// (Real timers are intentional here: the server's autoSave runs on its own
// clock with no completion event, so we poll the file — fake timers cannot
// observe another process's SQLite commits.)
async function waitForPersisted(
  file: string,
  table: string,
  row: string,
  cell: string,
  value: unknown,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    const probe = createMergeableStore();
    const db = await openDatabase(file, { readonly: true });
    const persister = createSqlite3Persister(probe, db);
    try {
      await persister.load();
      last = probe.getCell(table, row, cell);
      if (last === value) return;
    } catch {
      // transient SQLite lock while the server auto-saves; retry
    }
    await persister.destroy();
    await new Promise<void>((resolve) => db.close(() => resolve()));
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    `timeout waiting for ${table}.${row}.${cell} to persist as ${JSON.stringify(value)} ` +
      `(got ${JSON.stringify(last)})`,
  );
}

async function connectClient(store: MergeableStore): Promise<WsSynchronizer> {
  const sync = await createWsSynchronizer(store, new WebSocket(url));
  await sync.startSync();
  return sync;
}

describe('sync server round-trip', () => {
  it('two clients exchange writes and a fresh client reads the persisted state', async () => {
    const a = createMergeableStore();
    const b = createMergeableStore();

    const syncA = await connectClient(a);
    const syncB = await connectClient(b);

    try {
      a.setCell('areas', 'd1', 'name', 'Family');
      a.setCell('areas', 'd1', 'createdAt', '2026-01-01T00:00:00Z');
      a.setCell('areas', 'd2', 'name', 'Health');
      a.setCell('areas', 'd2', 'parentId', 'd1');

      await waitForCell(b, 'areas', 'd1', 'name', 'Family');
      expect(b.getCell('areas', 'd2', 'parentId')).toBe('d1');

      b.setCell('projects', 'p1', 'areaId', 'd1');
      b.setCell('projects', 'p1', 'name', 'Plan vacation');
      await waitForCell(a, 'projects', 'p1', 'name', 'Plan vacation');

      await waitForPersisted(dbPath, 'projects', 'p1', 'name', 'Plan vacation');
    } finally {
      await syncA.destroy();
      await syncB.destroy();
    }

    const fresh = createMergeableStore();
    const freshSync = await connectClient(fresh);
    try {
      await waitForCell(fresh, 'areas', 'd1', 'name', 'Family');
      await waitForCell(fresh, 'areas', 'd2', 'parentId', 'd1');
      await waitForCell(fresh, 'projects', 'p1', 'name', 'Plan vacation');
    } finally {
      await freshSync.destroy();
    }

    const reload = createMergeableStore();
    const reloadDb = await openDatabase(dbPath, { readonly: true });
    const reloadPersister = createSqlite3Persister(reload, reloadDb);
    await reloadPersister.load();
    const { promise: closed, resolve: closeResolved } =
      Promise.withResolvers<void>();
    reloadDb.close(() => closeResolved());
    await closed;
    expect(reload.getCell('areas', 'd1', 'name')).toBe('Family');
    expect(reload.getCell('areas', 'd2', 'parentId')).toBe('d1');
    expect(reload.getCell('projects', 'p1', 'name')).toBe('Plan vacation');
  }, 30000);

  it('a row deleted on one client disappears on the other and on a fresh client', async () => {
    const a = createMergeableStore();
    const b = createMergeableStore();

    const syncA = await connectClient(a);
    const syncB = await connectClient(b);

    try {
      a.setCell('areas', 'd-del', 'name', 'Doomed');
      a.setCell('areas', 'd-del', 'createdAt', '2026-01-01T00:00:00Z');
      a.setCell('areas', 'd-keep', 'name', 'Kept');
      a.setCell('areas', 'd-keep', 'createdAt', '2026-01-01T00:00:00Z');
      await waitForCell(b, 'areas', 'd-del', 'name', 'Doomed');
      await waitForCell(b, 'areas', 'd-keep', 'name', 'Kept');

      a.delRow('areas', 'd-del');
      await waitForRowAbsent(b, 'areas', 'd-del');
      expect(b.hasRow('areas', 'd-keep')).toBe(true);
      await waitForPersisted(dbPath, 'areas', 'd-keep', 'name', 'Kept');
      await waitForPersisted(dbPath, 'areas', 'd-del', 'name', undefined);
    } finally {
      await syncA.destroy();
      await syncB.destroy();
    }

    const fresh = createMergeableStore();
    const freshSync = await connectClient(fresh);
    try {
      await waitForCell(fresh, 'areas', 'd-keep', 'name', 'Kept');
      expect(fresh.hasRow('areas', 'd-del')).toBe(false);
    } finally {
      await freshSync.destroy();
    }
  }, 30000);
});
