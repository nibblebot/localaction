import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { TASK_STATUS } from '../../src/data/schema.ts';
import {
  createTask,
  updateTask,
  deleteTask,
  setTaskStatus,
  getTask,
  getTasksForProjectDeep,
} from '../../src/data/tasks.ts';
import { createProject } from '../../src/data/projects.ts';
import { createArea } from '../../src/data/areas.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

describe('tasks', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('createTask writes a task with default open status and stores title/projectId', () => {
    const d = createArea(store, { name: 'Work' });
    const p = createProject(store, { name: 'P1', areaId: d });
    const t = createTask(store, { title: 'Ship it', projectId: p });
    const row = getTask(store, t);
    expect(row).toBeDefined();
    expect(row?.title).toBe('Ship it');
    expect(row?.status).toBe(TASK_STATUS.open);
    expect(row?.projectId).toBe(p);
  });

  it('setTaskStatus toggles open <-> done', () => {
    const d = createArea(store, { name: 'Work' });
    const p = createProject(store, { name: 'P1', areaId: d });
    const t = createTask(store, { title: 'Ship it', projectId: p });
    setTaskStatus(store, t, TASK_STATUS.done);
    expect(getTask(store, t)?.status).toBe(TASK_STATUS.done);
    setTaskStatus(store, t, TASK_STATUS.open);
    expect(getTask(store, t)?.status).toBe(TASK_STATUS.open);
  });

  it('updateTask patches title and projectId', () => {
    const d = createArea(store, { name: 'Work' });
    const p1 = createProject(store, { name: 'P1', areaId: d });
    const p2 = createProject(store, { name: 'P2', areaId: d });
    const t = createTask(store, { title: 'old', projectId: p1 });
    updateTask(store, t, { title: 'new', projectId: p2 });
    const row = getTask(store, t);
    expect(row?.title).toBe('new');
    expect(row?.projectId).toBe(p2);
  });

  it('getTasksForProjectDeep returns top-level and nested tasks for a project', () => {
    const d = createArea(store, { name: 'Work' });
    const p = createProject(store, { name: 'P1', areaId: d });
    const t1 = createTask(store, { title: 'parent', projectId: p });
    const t2 = createTask(store, { title: 'child', projectId: p, parentTaskId: t1 });
    const t3 = createTask(store, { title: 'sibling', projectId: p });
    const all = getTasksForProjectDeep(store, p).sort();
    expect(all).toEqual([t1, t2, t3].sort());
  });

  it('getTasksForProjectDeep ignores tasks in other projects', () => {
    const d = createArea(store, { name: 'Work' });
    const p1 = createProject(store, { name: 'P1', areaId: d });
    const p2 = createProject(store, { name: 'P2', areaId: d });
    const t1 = createTask(store, { title: 'p1', projectId: p1 });
    createTask(store, { title: 'p2', projectId: p2 });
    expect(getTasksForProjectDeep(store, p1)).toEqual([t1]);
  });

  it('deleteTask removes the row', () => {
    const d = createArea(store, { name: 'Work' });
    const p = createProject(store, { name: 'P1', areaId: d });
    const t = createTask(store, { title: 'X', projectId: p });
    deleteTask(store, t);
    expect(getTask(store, t)).toBeUndefined();
  });
});
