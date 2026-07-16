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
 *      full persisted state (Domain, Sub-Domain, Project).
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
      a.setCell('domains', 'd1', 'name', 'Family');
      a.setCell('domains', 'd1', 'createdAt', '2026-01-01T00:00:00Z');
      a.setCell('domains', 'd2', 'name', 'Health');
      a.setCell('domains', 'd2', 'parentId', 'd1');

      await waitForCell(b, 'domains', 'd1', 'name', 'Family');
      expect(b.getCell('domains', 'd2', 'parentId')).toBe('d1');

      b.setCell('projects', 'p1', 'domainId', 'd1');
      b.setCell('projects', 'p1', 'name', 'Plan vacation');
      await waitForCell(a, 'projects', 'p1', 'name', 'Plan vacation');

      const { promise: settled, resolve: settle } = Promise.withResolvers<void>();
      setTimeout(settle, 250);
      await settled;
    } finally {
      await syncA.destroy();
      await syncB.destroy();
    }

    const fresh = createMergeableStore();
    const freshSync = await connectClient(fresh);
    try {
      await waitForCell(fresh, 'domains', 'd1', 'name', 'Family');
      expect(fresh.getCell('domains', 'd2', 'parentId')).toBe('d1');
      expect(fresh.getCell('projects', 'p1', 'name')).toBe('Plan vacation');
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
    expect(reload.getCell('domains', 'd1', 'name')).toBe('Family');
    expect(reload.getCell('domains', 'd2', 'parentId')).toBe('d1');
    expect(reload.getCell('projects', 'p1', 'name')).toBe('Plan vacation');
  });

  it('a row deleted on one client disappears on the other and on a fresh client', async () => {
    const a = createMergeableStore();
    const b = createMergeableStore();

    const syncA = await connectClient(a);
    const syncB = await connectClient(b);

    try {
      a.setCell('domains', 'd-del', 'name', 'Doomed');
      a.setCell('domains', 'd-del', 'createdAt', '2026-01-01T00:00:00Z');
      a.setCell('domains', 'd-keep', 'name', 'Kept');
      a.setCell('domains', 'd-keep', 'createdAt', '2026-01-01T00:00:00Z');
      await waitForCell(b, 'domains', 'd-del', 'name', 'Doomed');
      await waitForCell(b, 'domains', 'd-keep', 'name', 'Kept');

      a.delRow('domains', 'd-del');
      await waitForRowAbsent(b, 'domains', 'd-del');
      expect(b.hasRow('domains', 'd-keep')).toBe(true);
    } finally {
      await syncA.destroy();
      await syncB.destroy();
    }

    const { promise: settled, resolve: settle } = Promise.withResolvers<void>();
    setTimeout(settle, 250);
    await settled;

    const fresh = createMergeableStore();
    const freshSync = await connectClient(fresh);
    try {
      await waitForCell(fresh, 'domains', 'd-keep', 'name', 'Kept');
      expect(fresh.hasRow('domains', 'd-del')).toBe(false);
    } finally {
      await freshSync.destroy();
    }
  });
});
