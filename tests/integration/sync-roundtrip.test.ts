/**
 * Sync-server round-trip integration test.
 *
 * Runs entirely in Node (no browser required): boots the same Node server
 * the production `pnpm start` uses, then connects two TinyBase
 * MergeableStores to it as if they were two browser tabs. Asserts that:
 *
 *   1. Two clients can each start sync against the server.
 *   2. A write on one client's store replicates to the other.
 *   3. After both clients disconnect, a third "fresh" client sees the
 *      full persisted state (Domain, Sub-Domain, Project).
 *   4. The SQLite file round-trips through `createSqlite3Persister.load()`.
 *
 * Lives under tests/integration so the vitest "node" project picks it up.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import sqlite3 from 'sqlite3';
import { startServer, type RunningServer } from '../../server/index.ts';

let port: number;
let dbPath: string;
let server: RunningServer;
let url: string;

beforeAll(async () => {
  port = 5190 + Math.floor(Math.random() * 100);
  dbPath = join(tmpdir(), `localaction-vitest-${Date.now()}-${process.pid}.db`);
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

function waitForCell(
  store: MergeableStore,
  table: string,
  row: string,
  cell: string,
  value: unknown,
  timeoutMs = 5_000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
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
  });
}

function waitForRowAbsent(
  store: MergeableStore,
  table: string,
  row: string,
  timeoutMs = 5_000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
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
  });
}

async function connectClient(store: MergeableStore): Promise<Awaited<ReturnType<typeof createWsSynchronizer>>> {
  const sync = await createWsSynchronizer(store, new WebSocket(url));
  await sync.startSync();
  return sync;
}

describe('sync server round-trip', () => {
  it(
    'two clients exchange writes and a fresh client reads the persisted state',
    { retry: 3, timeout: 20_000 },
    async () => {
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
      console.log('[debug] B has domains:', JSON.stringify(b.getTables()));

      b.setCell('projects', 'p1', 'domainId', 'd1');
      b.setCell('projects', 'p1', 'name', 'Plan vacation');
      await waitForCell(a, 'projects', 'p1', 'name', 'Plan vacation');
      console.log('[debug] A has domains+projects:', JSON.stringify(a.getTables()));

      await new Promise((r) => setTimeout(r, 250));
    } finally {
      await syncA.destroy();
      await syncB.destroy();
    }

    const fresh = createMergeableStore();
    const freshSync = await connectClient(fresh);
    try {
      await waitForCell(fresh, 'domains', 'd1', 'name', 'Family');
      console.log(
        '[debug] fresh sync tables:',
        JSON.stringify(fresh.getTables()),
      );
      console.log(
        '[debug] fresh mergeableContent keys:',
        JSON.stringify((fresh.getMergeableContent() as unknown[][])[0]),
      );
      expect(fresh.getCell('domains', 'd2', 'parentId')).toBe('d1');
      expect(fresh.getCell('projects', 'p1', 'name')).toBe('Plan vacation');
    } finally {
      await freshSync.destroy();
    }

    const reload = createMergeableStore();
    const reloadDb = await new Promise<sqlite3.Database>((resolve, reject) => {
      const db = new sqlite3.Database(
        dbPath,
        sqlite3.OPEN_READONLY,
        (err) => (err ? reject(err) : resolve(db)),
      );
    });
    const reloadPersister = createSqlite3Persister(reload, reloadDb);
    await reloadPersister.load();
    await new Promise<void>((resolve) => reloadDb.close(() => resolve()));
    console.log(
      '[debug] reload tables:',
      JSON.stringify(reload.getTables()),
    );
    expect(reload.getCell('domains', 'd1', 'name')).toBe('Family');
    expect(reload.getCell('domains', 'd2', 'parentId')).toBe('d1');
    expect(reload.getCell('projects', 'p1', 'name')).toBe('Plan vacation');
    },
  );

  it(
    'a row deleted on one client disappears on the other and on a fresh client',
    { retry: 3, timeout: 20_000 },
    async () => {
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

      await new Promise((r) => setTimeout(r, 250));

      const fresh = createMergeableStore();
      const freshSync = await connectClient(fresh);
      try {
        await waitForCell(fresh, 'domains', 'd-keep', 'name', 'Kept');
        expect(fresh.hasRow('domains', 'd-del')).toBe(false);
      } finally {
        await freshSync.destroy();
      }
    },
  );
});