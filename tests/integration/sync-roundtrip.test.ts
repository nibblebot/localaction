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
 *   4. The SQLite file contains a parseable mergeable-content blob.
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
  return new Promise((resolve, reject) => {
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

async function connectClient(store: MergeableStore): Promise<Awaited<ReturnType<typeof createWsSynchronizer>>> {
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
      // Both clients write into their own stores; each write should reach
      // the other via the server.
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

      // Let the server's autoSave flush before tearing the path down.
      await new Promise((r) => setTimeout(r, 250));
    } finally {
      await syncA.destroy();
      await syncB.destroy();
    }

    // A fresh client joins and reads what the server persisted.
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

    // Independent sanity check: open the SQLite file directly and confirm
    // the mergeable-content blob is parseable and round-trips.
    const raw = await readSqliteBlob(dbPath);
    expect(raw).toBeTypeOf('string');
    console.log('[debug] sqlite blob length:', raw.length);
    const parsed = JSON.parse(raw) as [unknown[], unknown];
    const reload = createMergeableStore();
    reload.setMergeableContent(parsed as never);
    console.log(
      '[debug] reload tables:',
      JSON.stringify(reload.getTables()),
    );
    expect(reload.getCell('domains', 'd1', 'name')).toBe('Family');
    expect(reload.getCell('domains', 'd2', 'parentId')).toBe('d1');
    expect(reload.getCell('projects', 'p1', 'name')).toBe('Plan vacation');
  }, 20_000);
});

function readSqliteBlob(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(file, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err);
      db.get<{ store?: unknown }>('SELECT store FROM tinybase WHERE _id = ?', '_', (err2, row) => {
        db.close();
        if (err2) return reject(err2);
        if (!row || typeof row.store !== 'string') {
          return reject(new Error('tinybase row missing or wrong shape'));
        }
        resolve(row.store);
      });
    });
  });
}