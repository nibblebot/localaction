/**
 * Sync-log tests.
 *
 * Ring-buffer behaviour (coalescing, capacity, clear, summaries, push
 * gating, sweep classification) is unit-tested with an injected clock.
 * Pull capture is exercised over the REAL sync path — two in-process WS
 * synchronizer clients against the prod server — because the capture seam
 * is TinyBase's internal apply slot (`store.__[4]`): calling the public
 * `applyMergeableChanges` directly would pass while real sync logs
 * nothing, so it is not accepted as proof.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'bun:test';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { createMergeableStore } from 'tinybase';
import type { MergeableChanges, MergeableStore } from 'tinybase';
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';
import { startServer } from '../../server/index.ts';
import type { RunningServer } from '../../server/index.ts';
import { TABLES, TOMBSTONE_ENTITY_TYPE } from '../../src/data/schema.ts';
import { createTask } from '../../src/data/tasks.ts';
import { installTombstoneReconciler } from '../../src/data/deletion.ts';
import { writeTombstone } from '../../src/data/tombstones.ts';
import {
  createSyncLog,
  installSyncLogCapture,
  recordConnectionEvent,
  setPushCaptureEnabled,
  summarizeTables,
  totalRows,
} from '../../src/data/syncLog.ts';
import type { SyncLog, SyncLogEvent } from '../../src/data/syncLog.ts';

// TinyBase's public types don't name the synchronizer returned by
// `createWsSynchronizer`; `connectClient` lets inference carry it.

function fakeClock(start = 1_000_000): {
  now: () => number;
  advance: (ms: number) => void;
} {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

// Real timers are unavoidable here: WS delivery happens on the network's
// clock with no completion event the test can await, so we poll an
// observable predicate. Fake timers cannot observe inbound sync traffic.
async function waitFor(
  description: string,
  predicate: () => boolean,
  timeoutMs = 5_000,
): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const deadline = Date.now() + timeoutMs;
  const tick = (): void => {
    if (predicate()) {
      resolve();
      return;
    }
    if (Date.now() > deadline) {
      reject(new Error(`timeout waiting for ${description}`));
      return;
    }
    setTimeout(tick, 25);
  };
  tick();
  return promise;
}

function eventsOfKind<K extends SyncLogEvent['kind']>(
  log: SyncLog,
  kind: K,
): Extract<SyncLogEvent, { kind: K }>[] {
  return log.events.filter(
    (e): e is Extract<SyncLogEvent, { kind: K }> => e.kind === kind,
  );
}

afterEach(() => {
  // Module-level gate — reset so tests never leak it into each other.
  setPushCaptureEnabled(false);
});

describe('syncLog ring buffer', () => {
  it('trims to capacity, dropping the oldest events', () => {
    const log = createSyncLog({ capacity: 3 });
    recordConnectionEvent(log, { kind: 'connecting' });
    recordConnectionEvent(log, { kind: 'connected' });
    recordConnectionEvent(log, { kind: 'idle' });
    recordConnectionEvent(log, { kind: 'connecting' });
    recordConnectionEvent(log, { kind: 'connected' });
    expect(log.events).toHaveLength(3);
    // Ids are monotonically increasing per log instance; the two oldest
    // (1, 2) were dropped.
    expect(log.events.map((e) => e.id)).toEqual([3, 4, 5]);
  });

  it('clear() empties the log and notifies subscribers', () => {
    const log = createSyncLog();
    let notified = 0;
    const unsubscribe = log.subscribe(() => {
      notified += 1;
    });
    recordConnectionEvent(log, { kind: 'connected' });
    expect(notified).toBe(1);
    expect(log.events).toHaveLength(1);
    log.clear();
    expect(log.events).toHaveLength(0);
    expect(notified).toBe(2);
    unsubscribe();
    recordConnectionEvent(log, { kind: 'idle' });
    expect(notified).toBe(2);
  });

  it('skips connection events identical to the previous one', () => {
    const log = createSyncLog();
    recordConnectionEvent(log, { kind: 'connected' });
    recordConnectionEvent(log, { kind: 'connected' });
    expect(log.events).toHaveLength(1);
    // Retry attempts differ by `attempt`, so they are NOT duplicates…
    recordConnectionEvent(log, {
      kind: 'retrying',
      attempt: 1,
      nextDelayMs: 5_000,
      reason: 'closed',
    });
    recordConnectionEvent(log, {
      kind: 'retrying',
      attempt: 2,
      nextDelayMs: 10_000,
      reason: 'closed',
    });
    expect(log.events).toHaveLength(3);
    // …but the exact same retry twice is.
    recordConnectionEvent(log, {
      kind: 'retrying',
      attempt: 2,
      nextDelayMs: 10_000,
      reason: 'closed',
    });
    expect(log.events).toHaveLength(3);
  });
});

describe('summarizeTables / totalRows', () => {
  it('orders tables canonically and pluralizes', () => {
    expect(
      summarizeTables({
        areas: { added: 1, updated: 0, removed: 0 },
        projects: { added: 3, updated: 0, removed: 0 },
        tasks: { added: 8, updated: 0, removed: 0 },
      }),
    ).toBe('8 Tasks, 3 Projects, 1 Area');
    expect(
      summarizeTables({
        tasks: { added: 0, updated: 2, removed: 1 },
        notes: { added: 1, updated: 0, removed: 0 },
        tombstones: { added: 2, updated: 0, removed: 0 },
      }),
    ).toBe('3 Tasks, 1 Note, 2 Tombstones');
    expect(summarizeTables({})).toBe('No changes');
    expect(
      summarizeTables({ tasks: { added: 0, updated: 0, removed: 0 } }),
    ).toBe('No changes');
  });

  it('totalRows sums added+updated+removed across tables', () => {
    expect(
      totalRows({
        tasks: { added: 2, updated: 1, removed: 1 },
        areas: { added: 0, updated: 0, removed: 1 },
      }),
    ).toBe(5);
    expect(totalRows({})).toBe(0);
  });
});

describe('push and sweep capture (local store)', () => {
  it('records pushes only after setPushCaptureEnabled(true)', () => {
    const clock = fakeClock();
    const store = createMergeableStore();
    const log = createSyncLog({ now: clock.now });
    const uninstall = installSyncLogCapture(store, log);

    store.setRow(TABLES.tasks, 't1', { title: 'one' });
    expect(log.events).toHaveLength(0);

    setPushCaptureEnabled(true);
    store.setCell(TABLES.tasks, 't1', 'title', 'two');
    // Post-transaction classification cannot tell add from update.
    expect(log.events).toHaveLength(1);
    expect(eventsOfKind(log, 'push')[0]?.tables[TABLES.tasks]).toEqual({
      added: 0,
      updated: 1,
      removed: 0,
    });

    clock.advance(3_000);
    store.delRow(TABLES.tasks, 't1');
    expect(log.events).toHaveLength(2);
    expect(eventsOfKind(log, 'push')[1]?.tables[TABLES.tasks]).toEqual({
      added: 0,
      updated: 0,
      removed: 1,
    });

    // Uninstall removes the listener: later commits log nothing.
    uninstall();
    store.setRow(TABLES.tasks, 't2', { title: 'three' });
    expect(log.events).toHaveLength(2);
  });

  it('classifies reconciler sweeps as sweep, not push', async () => {
    const store = createMergeableStore();
    const log = createSyncLog();
    const uninstallReconciler = installTombstoneReconciler(store);
    const uninstallCapture = installSyncLogCapture(store, log);
    setPushCaptureEnabled(true);

    const taskId = createTask(store, { title: 'Doomed' });
    writeTombstone(store, TOMBSTONE_ENTITY_TYPE.task, taskId);
    // The reconciler sweeps on a queued microtask — flush it (twice, so
    // the sweep's own follow-up schedule also settles).
    await Promise.resolve();
    await Promise.resolve();

    expect(store.hasRow(TABLES.tasks, taskId)).toBe(false);
    // One transaction = one event: createTask and writeTombstone are two
    // pushes; the reconciler's deletion is a separate sweep event and
    // must NOT appear as a push.
    expect(log.events.map((e) => e.kind)).toEqual(['push', 'push', 'sweep']);
    const [taskPush, tombstonePush] = eventsOfKind(log, 'push');
    expect(taskPush?.tables[TABLES.tasks]).toEqual({
      added: 0,
      updated: 1,
      removed: 0,
    });
    expect(tombstonePush?.tables[TABLES.tombstones]).toEqual({
      added: 0,
      updated: 1,
      removed: 0,
    });
    const sweep = eventsOfKind(log, 'sweep')[0];
    expect(sweep?.tables[TABLES.tasks]).toEqual({
      added: 0,
      updated: 0,
      removed: 1,
    });

    uninstallCapture();
    uninstallReconciler();
  });
});

describe('pull capture via the internal apply slot', () => {
  it('records an echo re-apply only once', () => {
    // Real MergeableChanges, produced by a source store's transaction.
    const source = createMergeableStore();
    source.startTransaction();
    source.setRow(TABLES.tasks, 't1', { title: 'a' });
    source.setRow(TABLES.tasks, 't2', { title: 'b' });
    const changes = source.getTransactionMergeableChanges();
    source.finishTransaction();

    const clock = fakeClock();
    const store = createMergeableStore();
    const log = createSyncLog({ now: clock.now });
    installSyncLogCapture(store, log);

    // Runtime-narrowed access to the (now wrapped) internal apply slot —
    // the same `in`/`Array.isArray`/`typeof` narrowing as production.
    if (
      !('__' in store) ||
      !Array.isArray(store.__) ||
      typeof store.__[4] !== 'function'
    ) {
      throw new Error('internal apply slot missing');
    }
    const apply = store.__[4] as (c: MergeableChanges) => unknown;

    apply(changes);
    // No coalescing: a buggy second record would always be its own event.
    clock.advance(3_000);
    // The OPFS-persister echo: identical body re-applied, zero net rows.
    apply(changes);

    expect(store.getRowIds(TABLES.tasks)).toEqual(['t1', 't2']);
    const pulls = eventsOfKind(log, 'pull');
    expect(pulls).toHaveLength(1);
    expect(pulls[0]?.tables[TABLES.tasks]).toEqual({
      added: 2,
      updated: 0,
      removed: 0,
    });
  });
});

describe('pull capture over real WS sync', () => {
  let port: number;
  let dbPath: string;
  let server: RunningServer;
  let url: string;
  let dbCounter = 0;

  // Fresh server + database per test: the server persists every write to
  // SQLite, so a shared instance would leak one test's rows into the next
  // test's initial pull.
  beforeEach(async () => {
    // Random non-default port (never 5173/7373), throwaway tmp database.
    port = 5390 + Math.floor(Math.random() * 100);
    dbPath = join(
      tmpdir(),
      `localaction-test-synclog-${Date.now()}-${process.pid}-${dbCounter++}.db`,
    );
    url = `ws://localhost:${port}/ws`;
    server = await startServer({ port, dbPath });
  });

  afterEach(async () => {
    await server.close();
    try {
      unlinkSync(dbPath);
    } catch {
      /* file may already be gone */
    }
  });

  async function connectClient(store: MergeableStore) {
    const sync = await createWsSynchronizer(store, new WebSocket(url));
    await sync.startSync();
    return sync;
  }

  it('logs the initial pull with per-table counts', async () => {
    const source = createMergeableStore();
    source.setRow(TABLES.tasks, 't1', { title: 'a' });
    source.setRow(TABLES.tasks, 't2', { title: 'b' });
    source.setRow(TABLES.projects, 'p1', { name: 'x' });
    const syncSource = await connectClient(source);

    const clock = fakeClock();
    const log = createSyncLog({ now: clock.now });
    const target = createMergeableStore();
    const uninstall = installSyncLogCapture(target, log);
    const syncTarget = await connectClient(target);

    try {
      await waitFor(
        'initial pull to land on target',
        () =>
          target.hasRow(TABLES.tasks, 't1') &&
          target.hasRow(TABLES.tasks, 't2') &&
          target.hasRow(TABLES.projects, 'p1'),
      );
      // The initial pull applies in a single transaction → one event.
      const pulls = eventsOfKind(log, 'pull');
      expect(pulls).toHaveLength(1);
      expect(pulls[0]?.tables[TABLES.tasks]).toEqual({
        added: 2,
        updated: 0,
        removed: 0,
      });
      expect(pulls[0]?.tables[TABLES.projects]).toEqual({
        added: 1,
        updated: 0,
        removed: 0,
      });
      // Capture only reads: both stores hold the same rows.
      expect(target.getRowIds(TABLES.tasks)).toEqual(
        source.getRowIds(TABLES.tasks),
      );
    } finally {
      uninstall();
      await syncTarget.destroy();
      await syncSource.destroy();
    }
  }, 15000);

  it('logs live updates with added/updated/removed classification', async () => {
    const source = createMergeableStore();
    source.setRow(TABLES.tasks, 't1', { title: 'a' });
    const syncSource = await connectClient(source);

    const clock = fakeClock();
    const log = createSyncLog({ now: clock.now });
    const target = createMergeableStore();
    const uninstall = installSyncLogCapture(target, log);
    const syncTarget = await connectClient(target);

    try {
      await waitFor('initial pull', () => target.hasRow(TABLES.tasks, 't1'));
      expect(eventsOfKind(log, 'pull')).toHaveLength(1);

      clock.advance(3_000);
      source.setCell(TABLES.tasks, 't1', 'title', 'a2');
      await waitFor(
        'update to replicate',
        () => target.getCell(TABLES.tasks, 't1', 'title') === 'a2',
      );
      let pulls = eventsOfKind(log, 'pull');
      expect(pulls).toHaveLength(2);
      expect(pulls[1]?.tables[TABLES.tasks]).toEqual({
        added: 0,
        updated: 1,
        removed: 0,
      });

      clock.advance(3_000);
      source.delRow(TABLES.tasks, 't1');
      await waitFor('delete to replicate', () => !target.hasRow(TABLES.tasks, 't1'));
      pulls = eventsOfKind(log, 'pull');
      expect(pulls).toHaveLength(3);
      expect(pulls[2]?.tables[TABLES.tasks]).toEqual({
        added: 0,
        updated: 0,
        removed: 1,
      });

      clock.advance(3_000);
      source.setRow(TABLES.tasks, 't2', { title: 'new' });
      await waitFor('add to replicate', () => target.hasRow(TABLES.tasks, 't2'));
      pulls = eventsOfKind(log, 'pull');
      expect(pulls).toHaveLength(4);
      expect(pulls[3]?.tables[TABLES.tasks]).toEqual({
        added: 1,
        updated: 0,
        removed: 0,
      });
    } finally {
      uninstall();
      await syncTarget.destroy();
      await syncSource.destroy();
    }
  }, 15000);

  it('records every pull as its own event, even in a burst', async () => {
    const source = createMergeableStore();
    source.setRow(TABLES.tasks, 'seed', { title: 'seed' });
    const syncSource = await connectClient(source);

    const clock = fakeClock();
    const log = createSyncLog({ now: clock.now });
    const target = createMergeableStore();
    const uninstall = installSyncLogCapture(target, log);
    const syncTarget = await connectClient(target);

    try {
      await waitFor('initial pull', () => target.hasRow(TABLES.tasks, 'seed'));
      expect(eventsOfKind(log, 'pull')).toHaveLength(1);

      // Two live pulls close together: no coalescing — one event each.
      clock.advance(3_000);
      source.setRow(TABLES.tasks, 'a', { title: 'a' });
      await waitFor('first live pull', () => target.hasRow(TABLES.tasks, 'a'));
      clock.advance(500);
      source.setRow(TABLES.tasks, 'b', { title: 'b' });
      await waitFor('second live pull', () => target.hasRow(TABLES.tasks, 'b'));

      const pulls = eventsOfKind(log, 'pull');
      expect(pulls).toHaveLength(3);
      expect(pulls[1]?.at).toBe(1_003_000);
      expect(pulls[1]?.tables[TABLES.tasks]).toEqual({
        added: 1,
        updated: 0,
        removed: 0,
      });
      expect(pulls[2]?.at).toBe(1_003_500);
      expect(pulls[2]?.tables[TABLES.tasks]).toEqual({
        added: 1,
        updated: 0,
        removed: 0,
      });
    } finally {
      uninstall();
      await syncTarget.destroy();
      await syncSource.destroy();
    }
  }, 15000);

  it('logs pushes for local writes and never for inbound merges', async () => {
    const source = createMergeableStore();
    const syncSource = await connectClient(source);

    const clock = fakeClock();
    const log = createSyncLog({ now: clock.now });
    const target = createMergeableStore();
    const uninstall = installSyncLogCapture(target, log);
    const syncTarget = await connectClient(target);

    try {
      // Gate closed: a local write logs nothing (empty source, so the
      // handshake itself produces no pull events either).
      target.setRow(TABLES.notes, 'n1', { title: 'one' });
      expect(log.events).toHaveLength(0);

      setPushCaptureEnabled(true);
      target.setRow(TABLES.notes, 'n2', { title: 'two' });
      const pushes = eventsOfKind(log, 'push');
      expect(pushes).toHaveLength(1);
      expect(pushes[0]?.tables[TABLES.notes]).toEqual({
        added: 0,
        updated: 1,
        removed: 0,
      });

      // An inbound merge afterwards must register as a pull, not a push
      // (the `applying` flag brackets the internal apply).
      clock.advance(3_000);
      source.setRow(TABLES.tasks, 't9', { title: 'inbound' });
      await waitFor('inbound pull', () => target.hasRow(TABLES.tasks, 't9'));
      expect(eventsOfKind(log, 'push')).toHaveLength(1);
      expect(eventsOfKind(log, 'pull')).toHaveLength(1);
    } finally {
      uninstall();
      await syncTarget.destroy();
      await syncSource.destroy();
    }
  }, 15000);
});
