import { describe, expect, it, beforeEach } from 'bun:test';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { createTask, setTaskStatus, getDerivedStatus } from '../../src/data/tasks.ts';
import { createArea } from '../../src/data/areas.ts';
import { createNote } from '../../src/data/notes.ts';
import {
  deleteArea,
  deleteTask,
  reconcileTombstones,
  installTombstoneReconciler,
} from '../../src/data/deletion.ts';
import {
  hasTombstone,
  getTombstone,
  tombstoneId,
} from '../../src/data/tombstones.ts';
import { TABLES, COLUMNS, NOTE_ENTITY_TYPE, TASK_STATUS } from '../../src/data/schema.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

describe('cascade deletion', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('deletes a sub-area and the tasks under it', () => {
    const a = createArea(store, { name: 'Family' });
    const sub = createArea(store, { name: 'Kids', parentId: a });
    const t = createTask(store, { title: 'T', placement: { kind: 'area', id: sub } });
    deleteArea(store, a);
    expect(store.hasRow(TABLES.areas, sub)).toBe(false);
    expect(store.hasRow(TABLES.tasks, t)).toBe(false);
    expect(hasTombstone(store, NOTE_ENTITY_TYPE.area, a)).toBe(true);
  });

  it('strips notes attached to any doomed entity', () => {
    const a = createArea(store, { name: 'A' });
    const t = createTask(store, { title: 'T', placement: { kind: 'area', id: a } });
    const areaNote = createNote(store, { title: 'an', entityType: 'area', entityId: a });
    const taskNote = createNote(store, { title: 'tn', entityType: 'task', entityId: t });
    deleteArea(store, a);
    expect(store.hasRow(TABLES.notes, areaNote)).toBe(false);
    expect(store.hasRow(TABLES.notes, taskNote)).toBe(false);
  });

  it('deletes a task and its sub-tasks', () => {
    const root = createTask(store, { title: 'root' });
    const child = createTask(store, { title: 'c', placement: { kind: 'task', id: root } });
    deleteTask(store, root);
    expect(store.hasRow(TABLES.tasks, root)).toBe(false);
    expect(store.hasRow(TABLES.tasks, child)).toBe(false);
  });

  it('deleting the only child snapshots the parent derived status first', () => {
    const parent = createTask(store, { title: 'parent' });
    const child = createTask(store, {
      title: 'child',
      placement: { kind: 'task', id: parent },
    });
    setTaskStatus(store, child, TASK_STATUS.done);
    // Parent derives done through its only child; deleting that child
    // converts the parent back to a leaf, so the derived status is
    // snapshotted into the parent's stored cell first.
    expect(getDerivedStatus(store, parent)).toBe(TASK_STATUS.done);
    deleteTask(store, child);
    expect(store.hasRow(TABLES.tasks, child)).toBe(false);
    expect(store.hasRow(TABLES.tasks, parent)).toBe(true);
    expect(store.getCell(TABLES.tasks, parent, COLUMNS.tasks.status)).toBe(TASK_STATUS.done);
    expect(store.hasCell(TABLES.tasks, parent, COLUMNS.tasks.completedAt)).toBe(true);
  });

  it('tombstone id is the deterministic composite `${entityType}:${entityId}`', () => {
    expect(tombstoneId('area', 'A1')).toBe('area:A1');
    expect(tombstoneId('task', 'T1')).toBe('task:T1');
  });

  it('getTombstone returns the recorded row', () => {
    const a = createArea(store, { name: 'A' });
    deleteArea(store, a);
    const t = getTombstone(store, NOTE_ENTITY_TYPE.area, a);
    expect(t).toBeDefined();
    expect(t?.entityType).toBe('area');
    expect(t?.entityId).toBe(a);
  });
});

describe('tombstone reconciler (sync-driven)', () => {
  it('reconcileTombstones is a no-op when no tombstones exist', () => {
    const store = freshStore();
    const a = createArea(store, { name: 'A' });
    expect(reconcileTombstones(store)).toBe(false);
    expect(store.hasRow(TABLES.areas, a)).toBe(true);
  });

  it('reconcileTombstones is a no-op when every tombstoned subtree is already gone', () => {
    const store = freshStore();
    const a = createArea(store, { name: 'A' });
    deleteArea(store, a);
    // The local mutator already cascaded; reconcile is idempotent.
    expect(reconcileTombstones(store)).toBe(false);
  });

  it('reconcileTombstones deletes a late-arriving task whose owner is tombstoned', () => {
    const store = freshStore();
    const a = createArea(store, { name: 'A' });
    deleteArea(store, a);
    // Now simulate replica2's offline addition of a task under A that
    // arrives via sync AFTER the tombstone.
    const t = createTask(store, { title: 'late', placement: { kind: 'area', id: a } });
    expect(store.hasRow(TABLES.tasks, t)).toBe(true);
    const changed = reconcileTombstones(store);
    expect(changed).toBe(true);
    expect(store.hasRow(TABLES.tasks, t)).toBe(false);
  });

  it('installTombstoneReconciler cascades a sync-delivered tombstone', async () => {
    const store = freshStore();
    const uninstall = installTombstoneReconciler(store);
    try {
      const a = createArea(store, { name: 'A' });
      const t = createTask(store, { title: 'T', placement: { kind: 'area', id: a } });
      // Local delete cascades + writes tombstone immediately.
      deleteArea(store, a);
      // Now simulate a sync-delivered tombstone for a SEPARATE target
      // whose subtree survives because the local replica hadn't seen
      // the original deletion. (The local delete already removed the
      // subtree; the reconciler is a no-op for this one.)
      // Verify the reconciler is wired: a synthetic tombstone for an
      // existing entity should sweep on the next microtask.
      expect(store.hasRow(TABLES.tasks, t)).toBe(false);
      // If we create a task under an already-deleted area, the
      // reconciler should catch it on the next did-finish-transaction.
      const t2 = createTask(store, { title: 'late2', placement: { kind: 'area', id: a } });
      // did-finish has fired; the reconciler is debounced via
      // queueMicrotask — give it a tick.
      await Promise.resolve();
      await Promise.resolve();
      expect(store.hasRow(TABLES.tasks, t2)).toBe(false);
    } finally {
      uninstall();
    }
  });
});