import { describe, expect, it, beforeEach } from 'bun:test';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { TABLES, COLUMNS, NOTE_ENTITY_TYPE, TOMBSTONE_ENTITY_TYPE } from '../../src/data/schema.ts';
import { createTask, getTask } from '../../src/data/tasks.ts';
import { createProject } from '../../src/data/projects.ts';
import { createArea } from '../../src/data/areas.ts';
import { createSection } from '../../src/data/sections.ts';
import { createNote } from '../../src/data/notes.ts';
import {
  deleteArea,
  deleteTask,
  deleteSection,
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

  it('round-trips an area cascade: sub-area, project, section, tasks', () => {
    const areaId = createArea(store, { name: 'Work', color: 'blue' });
    const subId = createArea(store, { name: 'Clients', color: 'green', parentId: areaId });
    const projectId = createProject(store, { name: 'Q3', areaId: subId });
    const sectionId = createSection(store, { name: 'Later', projectId });
    const areaTask = createTask(store, { title: 'Area task', placement: { kind: 'area', id: areaId } });
    const projTask = createTask(store, { title: 'Proj task', placement: { kind: 'project', id: projectId } });
    const sectTask = createTask(store, { title: 'Sect task', placement: { kind: 'section', id: sectionId } });

    const snapshot = captureSubtree(store, NOTE_ENTITY_TYPE.area, areaId);
    deleteArea(store, areaId);

    for (const id of [areaId, subId]) expect(store.hasRow(TABLES.areas, id)).toBe(false);
    expect(store.hasRow(TABLES.projects, projectId)).toBe(false);
    expect(store.hasRow(TABLES.sections, sectionId)).toBe(false);
    for (const id of [areaTask, projTask, sectTask]) expect(getTask(store, id)).toBeUndefined();

    restoreSubtree(store, snapshot);

    expect(store.getCell(TABLES.areas, subId, COLUMNS.areas.parentId)).toBe(areaId);
    expect(store.getCell(TABLES.projects, projectId, COLUMNS.projects.areaId)).toBe(subId);
    expect(store.hasRow(TABLES.sections, sectionId)).toBe(true);
    expect(getTask(store, areaTask)?.title).toBe('Area task');
    expect(getTask(store, projTask)?.title).toBe('Proj task');
    expect(getTask(store, sectTask)?.title).toBe('Sect task');
    expect(hasTombstone(store, NOTE_ENTITY_TYPE.area, areaId)).toBe(false);
  });

  it('round-trips a section delete, including the tasks rooted at it', () => {
    const areaId = createArea(store, { name: 'A', color: 'gray' });
    const projectId = createProject(store, { name: 'P', areaId });
    const sectionId = createSection(store, { name: 'Later', projectId });
    const taskId = createTask(store, { title: 'Sect task', placement: { kind: 'section', id: sectionId } });

    const snapshot = captureSubtree(store, TOMBSTONE_ENTITY_TYPE.section, sectionId);
    deleteSection(store, sectionId);
    expect(store.hasRow(TABLES.sections, sectionId)).toBe(false);
    expect(getTask(store, taskId)).toBeUndefined();

    restoreSubtree(store, snapshot);
    expect(store.getCell(TABLES.sections, sectionId, COLUMNS.sections.name)).toBe('Later');
    expect(getTask(store, taskId)?.title).toBe('Sect task');
    expect(hasTombstone(store, TOMBSTONE_ENTITY_TYPE.section, sectionId)).toBe(false);
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
