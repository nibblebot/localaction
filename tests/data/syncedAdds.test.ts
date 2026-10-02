/**
 * Synced-add tests.
 *
 * The registry (TTL, cap, non-destructive reads) is unit-tested with an
 * injected clock. The notification channel is exercised through the REAL
 * capture seam — TinyBase's internal apply slot (`store.__[4]`), same
 * drive technique as `syncLog.test.ts` — because public
 * `applyMergeableChanges` would bypass the wrapper that classifies and
 * notifies net-added rows.
 */
import { describe, expect, it } from 'bun:test';
import { createMergeableStore } from 'tinybase';
import type { MergeableChanges, MergeableStore } from 'tinybase';
import { TABLES } from '../../src/data/schema.ts';
import { createSyncedAddRegistry } from '../../src/data/syncedAdds.ts';
import {
  createSyncLog,
  installSyncLogCapture,
  subscribeSyncedRowAdds,
} from '../../src/data/syncLog.ts';

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

// MergeableChanges for a simulated inbound pull, produced by a source
// store's real transaction — same technique as syncLog.test.ts.
function pullChanges(
  build: (source: MergeableStore) => void,
  source: MergeableStore = createMergeableStore(),
): MergeableChanges {
  source.startTransaction();
  build(source);
  const changes = source.getTransactionMergeableChanges();
  source.finishTransaction();
  return changes;
}

// A store with pull capture attached and its internal apply slot narrowed.
function capturedStore(): {
  store: MergeableStore;
  apply: (changes: MergeableChanges) => unknown;
} {
  const store = createMergeableStore();
  installSyncLogCapture(store, createSyncLog());
  if (!('__' in store) || !Array.isArray(store.__) || typeof store.__[4] !== 'function') {
    throw new Error('internal apply slot missing');
  }
  return { store, apply: store.__[4] as (c: MergeableChanges) => unknown };
}

describe('synced-add registry', () => {
  it('marks ids, reads non-destructively, and clears', () => {
    const registry = createSyncedAddRegistry({ now: fakeClock().now });
    registry.markSyncedTaskAdds(['t1']);
    expect(registry.hasSyncedTaskAdd('t1')).toBe(true);
    // StrictMode double-mount: the second read must still see the mark.
    expect(registry.hasSyncedTaskAdd('t1')).toBe(true);
    registry.clearSyncedTaskAdd('t1');
    expect(registry.hasSyncedTaskAdd('t1')).toBe(false);
    // Clearing an unknown id is a no-op.
    registry.clearSyncedTaskAdd('nope');
  });

  it('expires marks after the TTL', () => {
    const clock = fakeClock();
    const registry = createSyncedAddRegistry({ now: clock.now });
    registry.markSyncedTaskAdds(['t1']);
    clock.advance(10_001);
    expect(registry.hasSyncedTaskAdd('t1')).toBe(false);
    // A fresh mark survives the same sweep that expired the old one.
    registry.markSyncedTaskAdds(['t2']);
    expect(registry.hasSyncedTaskAdd('t2')).toBe(true);
  });

  it('ignores bulk batches over the cap but accepts batches at it', () => {
    const registry = createSyncedAddRegistry({ now: fakeClock().now });
    const bulk = Array.from({ length: 25 }, (_, i) => `b${i}`);
    registry.markSyncedTaskAdds(bulk);
    expect(bulk.some((id) => registry.hasSyncedTaskAdd(id))).toBe(false);

    const atCap = Array.from({ length: 24 }, (_, i) => `c${i}`);
    registry.markSyncedTaskAdds(atCap);
    expect(atCap.every((id) => registry.hasSyncedTaskAdd(id))).toBe(true);
  });
});

describe('subscribeSyncedRowAdds', () => {
  it('notifies net-added rows per table in one call per pull', () => {
    const { apply } = capturedStore();
    const calls: [string, readonly string[]][] = [];
    const unsubscribe = subscribeSyncedRowAdds((table, rowIds) => {
      calls.push([table, rowIds]);
    });

    apply(
      pullChanges((s) => {
        s.setRow(TABLES.tasks, 't1', { title: 'a' });
        s.setRow(TABLES.tasks, 't2', { title: 'b' });
        s.setRow(TABLES.notes, 'n1', { title: 'n' });
      }),
    );

    expect(calls).toEqual([
      [TABLES.tasks, ['t1', 't2']],
      [TABLES.notes, ['n1']],
    ]);
    unsubscribe();
  });

  it('notifies only net-added rows — never updates, removals, or echoes', () => {
    const { store, apply } = capturedStore();
    const calls: [string, readonly string[]][] = [];
    const unsubscribe = subscribeSyncedRowAdds((table, rowIds) => {
      calls.push([table, rowIds]);
    });

    // One source store across all three diffs, so each later write has a
    // newer HLC than what the target holds and merges as a real change.
    const source = createMergeableStore();
    apply(pullChanges((s) => s.setRow(TABLES.tasks, 't1', { title: 'a' }), source));
    expect(calls).toEqual([[TABLES.tasks, ['t1']]]);

    // Update: t1 exists on the target → classified updated, not added.
    apply(pullChanges((s) => s.setCell(TABLES.tasks, 't1', 'title', 'a2'), source));
    // Removal: a deleted row is not an arrival.
    apply(pullChanges((s) => s.delRow(TABLES.tasks, 't1'), source));
    expect(calls).toHaveLength(1);

    // Echo: re-applying the original add nets zero rows → no notify.
    apply(pullChanges((s) => s.setRow(TABLES.tasks, 't9', { title: 'x' }), source));
    expect(calls).toHaveLength(2); // sanity: the t9 add itself notified
    const echoSource = createMergeableStore();
    const echo = pullChanges((s) => s.setRow(TABLES.tasks, 't9', { title: 'x' }), echoSource);
    apply(echo);
    expect(store.hasRow(TABLES.tasks, 't9')).toBe(true);
    expect(calls).toHaveLength(2);

    unsubscribe();
  });

  it('stops notifying after unsubscribe', () => {
    const { apply } = capturedStore();
    const calls: [string, readonly string[]][] = [];
    const unsubscribe = subscribeSyncedRowAdds((table, rowIds) => {
      calls.push([table, rowIds]);
    });
    unsubscribe();

    apply(pullChanges((s) => s.setRow(TABLES.tasks, 't1', { title: 'a' })));
    expect(calls).toHaveLength(0);
  });
});
