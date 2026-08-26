/**
 * Sync-server round-trip integration test.
 *
 * Boots the same prod server that `bun run prod` uses, then connects two
 * TinyBase MergeableStores to it as if they were two browser tabs.
 * Asserts that:
 *
 *   1. Two clients can each start sync against the server.
 *   2. A write on one client's store replicates to the other.
 *   3. After both clients disconnect, a third "fresh" client sees the
 *      full persisted state (Area, Sub-Area, Task).
 *   4. The SQLite file round-trips through the tabular server persister's
 *      `load()` (`createServerTabularPersister`).
 *
 * Runs under `bun test` (real `ws` + `bun:sqlite` modules, no DOM).
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'bun:test';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createMergeableStore, createStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import {
  createWsSynchronizer,
} from 'tinybase/synchronizers/synchronizer-ws-client';
import { startServer, type RunningServer } from '../../server/index.ts';
import { openDatabase } from '../../server/db.ts';
import { createServerTabularPersister } from '../../server/persister.ts';
import { createTask, updateTask, setTaskStatus } from '../../src/data/tasks.ts';
import { TASK_STATUS } from '../../src/data/schema.ts';
import { toIso } from '../../src/components/shared/dates.ts';

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
    const probe = createStore();
    const db = await openDatabase(file, { readonly: true });
    const persister = createServerTabularPersister(probe, db);
    try {
      await persister.load();
      last = probe.getCell(table, row, cell);
      if (last === value) return;
    } catch {
      // transient SQLite lock while the server auto-saves; retry
    }
    await persister.destroy();
    db.close();
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

      b.setCell('tasks', 't1', 'placement', 'area:d1');
      b.setCell('tasks', 't1', 'title', 'Plan vacation');
      await waitForCell(a, 'tasks', 't1', 'title', 'Plan vacation');

      await waitForPersisted(dbPath, 'tasks', 't1', 'title', 'Plan vacation');
    } finally {
      await syncA.destroy();
      await syncB.destroy();
    }

    const fresh = createMergeableStore();
    const freshSync = await connectClient(fresh);
    try {
      await waitForCell(fresh, 'areas', 'd1', 'name', 'Family');
      await waitForCell(fresh, 'areas', 'd2', 'parentId', 'd1');
      await waitForCell(fresh, 'tasks', 't1', 'title', 'Plan vacation');
    } finally {
      await freshSync.destroy();
    }

    const reload = createStore();
    const reloadDb = await openDatabase(dbPath, { readonly: true });
    const reloadPersister = createServerTabularPersister(reload, reloadDb);
    await reloadPersister.load();
    reloadDb.close();
    expect(reload.getCell('areas', 'd1', 'name')).toBe('Family');
    expect(reload.getCell('areas', 'd2', 'parentId')).toBe('d1');
    expect(reload.getCell('tasks', 't1', 'title')).toBe('Plan vacation');
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

  it('completedAt round-trips: client A sets it, client B sees it, fresh client reads it from SQLite', async () => {
    const a = createMergeableStore();
    const b = createMergeableStore();

    const syncA = await connectClient(a);
    const syncB = await connectClient(b);

    let taskId = '';
    let completedOnB: unknown = undefined;
    try {
      // Client A creates a task due tomorrow and marks it done via the
      // typed writer. The helper stamps a real `completedAt` cell.
      taskId = createTask(a, { title: 'completed-roundtrip' });
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dueTomorrow = toIso(
        tomorrow.getFullYear(),
        tomorrow.getMonth(),
        tomorrow.getDate(),
      );
      updateTask(a, taskId, { dueDate: dueTomorrow });
      setTaskStatus(a, taskId, TASK_STATUS.done);

      // Client B observes the completedAt cell.
      await waitForCell(b, 'tasks', taskId, 'status', TASK_STATUS.done);
      completedOnB = b.getCell('tasks', taskId, 'completedAt');
      expect(typeof completedOnB).toBe('string');
      expect((completedOnB as string).length).toBeGreaterThan(0);

      await waitForPersisted(
        dbPath,
        'tasks',
        taskId,
        'completedAt',
        completedOnB,
      );
    } finally {
      await syncA.destroy();
      await syncB.destroy();
    }

    // A fresh client as a MergeableStore reads the cell from the
    // server-side buffer. Server is the source of truth, so the
    // replica carries the same value client B observed.
    const fresh = createMergeableStore();
    const freshSync = await connectClient(fresh);
    try {
      await waitForCell(
        fresh,
        'tasks',
        taskId,
        'completedAt',
        completedOnB,
      );
      expect(fresh.getCell('tasks', taskId, 'completedAt')).toBe(completedOnB as string);
    } finally {
      await freshSync.destroy();
    }

    // Round-trip via SQLite: open the SQLite file directly and confirm
    // the completedAt cell is still readable after the server's in-memory
    // store has been destroyed.
    const reload = createStore();
    const reloadDb = await openDatabase(dbPath, { readonly: true });
    const reloadPersister = createServerTabularPersister(reload, reloadDb);
    await reloadPersister.load();
    reloadDb.close();
    expect(typeof reload.getCell('tasks', taskId, 'completedAt')).toBe('string');
    expect(reload.getCell('tasks', taskId, 'status')).toBe(TASK_STATUS.done);
  }, 30000);
});
