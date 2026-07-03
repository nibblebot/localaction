/**
 * Smoke test for the data layer + sync server.
 *
 * Runs entirely in Node (no browser required): boots the same Node server
 * the production `pnpm start` uses, then connects two TinyBase
 * MergeableStores to it as if they were two browser tabs. Verifies that:
 *
 *   1. The WS handshake completes and each client sees a `connected` status.
 *   2. A write on the first store appears on the second.
 *   3. The SQLite file actually persists the row (read it back directly).
 *
 * This is the phase-0 equivalent of an integration test, since this repo has
 * no test framework per `AGENTS.md`. Run with `pnpm smoke`.
 */

import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createMergeableStore } from 'tinybase';
import {
  createWsSynchronizer,
} from 'tinybase/synchronizers/synchronizer-ws-client';
import sqlite3 from 'sqlite3';
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout: ${label}`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main() {
  const server = await startServer({ port: PORT, dbPath: DB_PATH });
  console.log(`smoke: server up on :${server.port}, db=${DB_PATH}`);

  try {
    // Wait for both clients to receive each other's writes.
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

    // Disconnect both clients so the server-side SQLite persister flushes
    // and a third (fresh) client can join and observe the same data.
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

    // Independent sanity check: open the SQLite file directly and confirm
    // TinyBase actually wrote a row into its default `tinybase` table. The
    // SQLite persister in DpcJson mode (the default for MergeableStore)
    // serialises the full content into a single JSON blob with HLC metadata,
    // so we parse the blob and assert the cells are present at the right
    // shape. We round-trip through a fresh MergeableStore to validate the
    // data we wrote can actually be re-loaded (TinyBase's own contract).
    const persisted = await new Promise<unknown>((resolve, reject) => {
      const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
        if (err) return reject(err);
        db.get('SELECT store FROM tinybase WHERE _id = ?', '_', (err2, row) => {
          db.close();
          if (err2) return reject(err2);
          try {
            resolve(JSON.parse(row.store));
          } catch (parseErr) {
            reject(parseErr);
          }
        });
      });
    });

    const reload = createMergeableStore();
    reload.setMergeableContent(persisted as never);
    assert(
      reload.getCell('domains', 'd1', 'name') === 'Family',
      'sqlite blob does not contain domains/d1/name',
    );
    assert(
      reload.getCell('domains', 'd2', 'parentId') === 'd1',
      'sqlite blob does not contain domains/d2/parentId (sub-domain)',
    );
    assert(
      reload.getCell('projects', 'p1', 'name') === 'Plan vacation',
      'sqlite blob does not contain projects/p1/name',
    );
    console.log(
      'smoke: sqlite blob round-trips Domain, Sub-Domain, and Project rows',
    );
  } finally {
    await server.close();
    try {
      unlinkSync(DB_PATH);
    } catch {
      // ignore
    }
  }
}

async function waitForCell(
  store: ReturnType<typeof createMergeableStore>,
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
