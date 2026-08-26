import { describe, expect, it, beforeEach } from 'bun:test';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { TABLES, COLUMNS, NOTE_ENTITY_TYPE } from '../../src/data/schema.ts';
import { createTask, getTask } from '../../src/data/tasks.ts';
import { createArea } from '../../src/data/areas.ts';
import { createNote } from '../../src/data/notes.ts';
import {
  deleteArea,
  deleteTask,
  installTombstoneReconciler,
} from '../../src/data/deletion.ts';
import { captureSubtree, restoreSubtree } from '../../src/data/undo.ts';
import { hasTombstone } from '../../src/data/tombstones.ts';

let store: MergeableStore;
beforeEach(() => {
  store = createMergeableStore();
});

describe('captureSubtree / restoreSubtree', () => {
  it('round-trips a task subtree with its note', () => {
    const parent = createTask(store, { title: 'Parent' });
    const child = createTask(store, { title: 'Child', placement: { kind: 'task', id: parent } });
    const noteId = createNote(store, {
      title: 'Specs',
      entityType: NOTE_ENTITY_TYPE.task,
      entityId: child,
    });

    const snapshot = captureSubtree(store, NOTE_ENTITY_TYPE.task, parent);
    deleteTask(store, parent);

    expect(getTask(store, parent)).toBeUndefined();
    expect(getTask(store, child)).toBeUndefined();
    expect(store.hasRow(TABLES.notes, noteId)).toBe(false);
    expect(hasTombstone(store, NOTE_ENTITY_TYPE.task, parent)).toBe(true);

    restoreSubtree(store, snapshot);

    expect(getTask(store, parent)?.title).toBe('Parent');
    expect(getTask(store, child)?.title).toBe('Child');
    expect(store.hasRow(TABLES.notes, noteId)).toBe(true);
    // The tombstone must go with the restore, or the next reconciler
    // sweep would re-delete the subtree.
    expect(hasTombstone(store, NOTE_ENTITY_TYPE.task, parent)).toBe(false);
  });

  it('restored rows survive the tombstone reconciler', async () => {
    const uninstall = installTombstoneReconciler(store);
    const taskId = createTask(store, { title: 'Fragile' });
    const snapshot = captureSubtree(store, NOTE_ENTITY_TYPE.task, taskId);
    deleteTask(store, taskId);
    // The reconciler sweeps on a queued microtask — flush it.
    await Promise.resolve();
    expect(getTask(store, taskId)).toBeUndefined();

    restoreSubtree(store, snapshot);
    // A post-transaction sweep must NOT re-delete the restored row.
    await Promise.resolve();
    expect(getTask(store, taskId)?.title).toBe('Fragile');
    uninstall();
  });

  it('round-trips an area cascade: sub-area and tasks', () => {
    const areaId = createArea(store, { name: 'Work', color: 'blue' });
    const subId = createArea(store, { name: 'Clients', color: 'green', parentId: areaId });
    const areaTask = createTask(store, { title: 'Area task', placement: { kind: 'area', id: areaId } });
    const subTask = createTask(store, { title: 'Sub task', placement: { kind: 'area', id: subId } });
    const nested = createTask(store, { title: 'Nested', placement: { kind: 'task', id: areaTask } });

    const snapshot = captureSubtree(store, NOTE_ENTITY_TYPE.area, areaId);
    deleteArea(store, areaId);

    for (const id of [areaId, subId]) expect(store.hasRow(TABLES.areas, id)).toBe(false);
    for (const id of [areaTask, subTask, nested]) expect(getTask(store, id)).toBeUndefined();

    restoreSubtree(store, snapshot);

    expect(store.getCell(TABLES.areas, subId, COLUMNS.areas.parentId)).toBe(areaId);
    expect(getTask(store, areaTask)?.title).toBe('Area task');
    expect(getTask(store, subTask)?.title).toBe('Sub task');
    expect(getTask(store, nested)?.title).toBe('Nested');
    expect(hasTombstone(store, NOTE_ENTITY_TYPE.area, areaId)).toBe(false);
  });

  it('preserves order cells so restored rows land in their old positions', () => {
    const a = createTask(store, { title: 'A' });
    const b = createTask(store, { title: 'B' });
    const orderBefore = store.getCell(TABLES.tasks, b, COLUMNS.tasks.order);

    const snapshot = captureSubtree(store, NOTE_ENTITY_TYPE.task, b);
    deleteTask(store, b);
    restoreSubtree(store, snapshot);

    expect(store.getCell(TABLES.tasks, b, COLUMNS.tasks.order)).toBe(orderBefore);
    expect(getTask(store, a)).toBeDefined();
  });
});