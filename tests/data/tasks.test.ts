import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { TASK_STATUS } from '../../src/data/schema.ts';
import {
  createTask,
  updateTask,
  setTaskStatus,
  getTask,
  getTasksForProjectDeep,
  getInboxTaskIds,
  getAreaTaskIds,
  getRootPlacement,
  getEffectiveTaskStatus,
  childTaskIds,
  descendantTaskIds,
  encodePlacement,
  decodePlacement,
} from '../../src/data/tasks.ts';
import { deleteTask } from '../../src/data/deletion.ts';
import { createProject } from '../../src/data/projects.ts';
import { createArea } from '../../src/data/areas.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

describe('task placement', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('createTask defaults to the Inbox and stores an open task', () => {
    const t = createTask(store, { title: 'Ship it' });
    const row = getTask(store, t);
    expect(row).toBeDefined();
    expect(row?.title).toBe('Ship it');
    expect(row?.status).toBe(TASK_STATUS.open);
    expect(row?.placement).toEqual({ kind: 'inbox' });
    expect(getInboxTaskIds(store)).toContain(t);
  });

  it('createTask stores project / area / sub-task placements', () => {
    const a = createArea(store, { name: 'Work' });
    const p = createProject(store, { name: 'P', areaId: a });
    const projectTask = createTask(store, {
      title: 'pt',
      placement: { kind: 'project', id: p },
    });
    const areaTask = createTask(store, {
      title: 'at',
      placement: { kind: 'area', id: a },
    });
    const subTask = createTask(store, {
      title: 'st',
      placement: { kind: 'task', id: projectTask },
    });
    expect(getTask(store, projectTask)?.placement).toEqual({ kind: 'project', id: p });
    expect(getTask(store, areaTask)?.placement).toEqual({ kind: 'area', id: a });
    expect(getTask(store, subTask)?.placement).toEqual({ kind: 'task', id: projectTask });
  });

  it('updateTask reparents via placement', () => {
    const a = createArea(store, { name: 'Work' });
    const p = createProject(store, { name: 'P', areaId: a });
    const t = createTask(store, { title: 'x', placement: { kind: 'project', id: p } });
    updateTask(store, t, { placement: { kind: 'area', id: a } });
    expect(getTask(store, t)?.placement).toEqual({ kind: 'area', id: a });
    updateTask(store, t, { placement: { kind: 'inbox' } });
    expect(getTask(store, t)?.placement).toEqual({ kind: 'inbox' });
  });

  it('encodePlacement / decodePlacement round-trip every kind', () => {
    const cases = [
      { kind: 'project', id: 'abc' },
      { kind: 'area', id: 'def' },
      { kind: 'task', id: 'ghi' },
      { kind: 'inbox' },
    ] as const;
    for (const c of cases) {
      expect(decodePlacement(encodePlacement(c))).toEqual(c);
    }
  });

  it('decodePlacement treats garbage / empty as Inbox', () => {
    expect(decodePlacement(undefined)).toEqual({ kind: 'inbox' });
    expect(decodePlacement('')).toEqual({ kind: 'inbox' });
    expect(decodePlacement('nope:1')).toEqual({ kind: 'inbox' });
    expect(decodePlacement('project:')).toEqual({ kind: 'inbox' });
  });
});

describe('task ancestry', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('childTaskIds / descendantTaskIds walk the placement `task:` chain', () => {
    const a = createArea(store, { name: 'Work' });
    const p = createProject(store, { name: 'P', areaId: a });
    const root = createTask(store, { title: 'root', placement: { kind: 'project', id: p } });
    const c1 = createTask(store, { title: 'c1', placement: { kind: 'task', id: root } });
    const c2 = createTask(store, { title: 'c2', placement: { kind: 'task', id: root } });
    const gc = createTask(store, { title: 'gc', placement: { kind: 'task', id: c1 } });
    expect(childTaskIds(store, root).sort()).toEqual([c1, c2].sort());
    expect(descendantTaskIds(store, root).sort()).toEqual([root, c1, c2, gc].sort());
  });

  it('getRootPlacement resolves ownership through the chain', () => {
    const a = createArea(store, { name: 'Work' });
    const p = createProject(store, { name: 'P', areaId: a });
    const root = createTask(store, { title: 'root', placement: { kind: 'project', id: p } });
    const child = createTask(store, { title: 'c', placement: { kind: 'task', id: root } });
    const gc = createTask(store, { title: 'gc', placement: { kind: 'task', id: child } });
    expect(getRootPlacement(store, gc)).toEqual({ kind: 'project', id: p });
    expect(getRootPlacement(store, root)).toEqual({ kind: 'project', id: p });
  });

  it('getTasksForProjectDeep gathers top-level + nested tasks for a project', () => {
    const a = createArea(store, { name: 'Work' });
    const p = createProject(store, { name: 'P', areaId: a });
    const t1 = createTask(store, { title: 'parent', placement: { kind: 'project', id: p } });
    const t2 = createTask(store, { title: 'child', placement: { kind: 'task', id: t1 } });
    const t3 = createTask(store, { title: 'sibling', placement: { kind: 'project', id: p } });
    expect(getTasksForProjectDeep(store, p).sort()).toEqual([t1, t2, t3].sort());
  });

  it('getAreaTaskIds and getInboxTaskIds partition top-level tasks', () => {
    const a = createArea(store, { name: 'Work' });
    const p = createProject(store, { name: 'P', areaId: a });
    const inbox = createTask(store, { title: 'i' });
    const areaT = createTask(store, { title: 'at', placement: { kind: 'area', id: a } });
    createTask(store, { title: 'pt', placement: { kind: 'project', id: p } });
    expect(getInboxTaskIds(store)).toEqual([inbox]);
    expect(getAreaTaskIds(store, a)).toEqual([areaT]);
  });
});

describe('task status derivation', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('setTaskStatus toggles a leaf open <-> done', () => {
    const t = createTask(store, { title: 'x' });
    setTaskStatus(store, t, TASK_STATUS.done);
    expect(getEffectiveTaskStatus(store, t)).toBe(TASK_STATUS.done);
    setTaskStatus(store, t, TASK_STATUS.open);
    expect(getEffectiveTaskStatus(store, t)).toBe(TASK_STATUS.open);
  });
  it('completing a parent only writes the parent cell; children re-derive', () => {
    const root = createTask(store, { title: 'root' });
    const c = createTask(store, { title: 'c', placement: { kind: 'task', id: root } });
    setTaskStatus(store, root, TASK_STATUS.done);
    // The child was never written, so it stays stored-open and the
    // parent effective status re-derives to open.
    expect(getEffectiveTaskStatus(store, c)).toBe(TASK_STATUS.open);
    expect(getEffectiveTaskStatus(store, root)).toBe(TASK_STATUS.open);
    // Completing the last child flips the parent to effective-done.
    setTaskStatus(store, c, TASK_STATUS.done);
    expect(getEffectiveTaskStatus(store, c)).toBe(TASK_STATUS.done);
    expect(getEffectiveTaskStatus(store, root)).toBe(TASK_STATUS.done);
  });

  it('a stored-done parent with an open child is effectively open', () => {
    const root = createTask(store, { title: 'root' });
    const c = createTask(store, { title: 'c', placement: { kind: 'task', id: root } });
    setTaskStatus(store, root, TASK_STATUS.done);
    setTaskStatus(store, c, TASK_STATUS.open);
    expect(getEffectiveTaskStatus(store, c)).toBe(TASK_STATUS.open);
    expect(getEffectiveTaskStatus(store, root)).toBe(TASK_STATUS.open);
  });

  it('reopening a descendant reopens every ancestor', () => {
    const root = createTask(store, { title: 'root' });
    const mid = createTask(store, { title: 'mid', placement: { kind: 'task', id: root } });
    const leaf = createTask(store, { title: 'leaf', placement: { kind: 'task', id: mid } });
    setTaskStatus(store, root, TASK_STATUS.done);
    setTaskStatus(store, leaf, TASK_STATUS.open);
    expect(getEffectiveTaskStatus(store, mid)).toBe(TASK_STATUS.open);
    expect(getEffectiveTaskStatus(store, root)).toBe(TASK_STATUS.open);
  });
});

describe('deleteTask', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('removes the task', () => {
    const t = createTask(store, { title: 'X' });
    deleteTask(store, t);
    expect(getTask(store, t)).toBeUndefined();
  });

  it('removes the whole subtree', () => {
    const root = createTask(store, { title: 'root' });
    const child = createTask(store, { title: 'c', placement: { kind: 'task', id: root } });
    deleteTask(store, root);
    expect(getTask(store, child)).toBeUndefined();
  });
});
