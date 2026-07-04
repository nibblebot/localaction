import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES, TASK_STATUS } from '../../src/data/schema.ts';
import {
  createTask,
  updateTask,
  deleteTask,
  setTaskStatus,
  getTask,
  getTasksForProject,
  getChildTasks,
  getOrphanedTaskIds,
  nextTaskOrder,
} from '../../src/data/tasks.ts';
import { createProject } from '../../src/data/projects.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

describe('tasks', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('createTask writes a row with default open status and a float order', () => {
    const p = 'p1';
    createProject(store, { name: 'P', domainId: 'd1' });
    store.setRow('projects', p, { name: 'P', domainId: 'd1' });
    const t = createTask(store, { title: 'Book flights', projectId: p });
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.title)).toBe('Book flights');
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.projectId)).toBe(p);
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.status)).toBe(TASK_STATUS.open);
    expect(Number.isFinite(store.getCell(TABLES.tasks, t, COLUMNS.tasks.order) as number)).toBe(true);
  });

  it('createTask appends after existing siblings via nextTaskOrder', () => {
    const t0 = createTask(store, { title: 't0', projectId: 'p1', order: 0 });
    const t1 = createTask(store, { title: 't1', projectId: 'p1' });
    const o0 = store.getCell(TABLES.tasks, t0, COLUMNS.tasks.order) as number;
    const o1 = store.getCell(TABLES.tasks, t1, COLUMNS.tasks.order) as number;
    expect(o1).toBeGreaterThan(o0);
  });

  it('nextTaskOrder returns 0 for an empty sibling set', () => {
    expect(nextTaskOrder(store, 'p1', null)).toBe(0);
  });

  it('setTaskStatus toggles open <-> done', () => {
    const t = createTask(store, { title: 't', projectId: 'p1' });
    setTaskStatus(store, t, TASK_STATUS.done);
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.status)).toBe(TASK_STATUS.done);
    setTaskStatus(store, t, TASK_STATUS.open);
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.status)).toBe(TASK_STATUS.open);
  });

  it('updateTask patches title / projectId / parentTaskId', () => {
    const t = createTask(store, { title: 't', projectId: 'p1' });
    updateTask(store, t, { title: 'renamed', projectId: 'p2' });
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.title)).toBe('renamed');
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.projectId)).toBe('p2');
    updateTask(store, t, { projectId: null });
    // Clearing projectId — but tasks need a projectId OR parentTaskId; allow
    // the caller to clear. We confirm the cell is gone.
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.projectId)).toBeUndefined();
  });

  it('getChildTasks returns direct sub-tasks of a parent', () => {
    const t = createTask(store, { title: 'parent', projectId: 'p1' });
    const c1 = createTask(store, { title: 'c1', projectId: 'p1', parentTaskId: t });
    createTask(store, { title: 'other', projectId: 'p1' });
    expect(getChildTasks(store, t)).toEqual([c1]);
  });

  it('deleteTask does NOT cascade — children keep parentTaskId and surface as orphans', () => {
    const t = createTask(store, { title: 'parent', projectId: 'p1' });
    const c1 = createTask(store, { title: 'c1', projectId: 'p1', parentTaskId: t });
    deleteTask(store, t);
    expect(store.hasRow(TABLES.tasks, c1)).toBe(true);
    expect(store.getCell(TABLES.tasks, c1, COLUMNS.tasks.parentTaskId)).toBe(t);
    expect(getOrphanedTaskIds(store)).toContain(c1);
  });

  it('getTasksForProject returns top-level tasks (parentTaskId unset) for a project', () => {
    const top = createTask(store, { title: 'top', projectId: 'p1' });
    const t2 = createTask(store, { title: 'top2', projectId: 'p1' });
    createTask(store, { title: 'child', projectId: 'p1', parentTaskId: top });
    expect(getTasksForProject(store, 'p1').sort()).toEqual([top, t2].sort());
  });

  it('getTask returns a normalised entity', () => {
    const t = createTask(store, { title: 't', projectId: 'p1' });
    const task = getTask(store, t);
    expect(task).toMatchObject({ id: t, title: 't', projectId: 'p1', parentTaskId: null, status: TASK_STATUS.open });
    expect(getTask(store, 'nope')).toBeUndefined();
  });
});