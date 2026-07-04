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
  getTasksForProject,
  getChildTasks,
  getOrphanedTaskIds,
  isTaskOrphaned,
  nextTaskOrder,
} from '../../src/data/tasks.ts';
import { createProject } from '../../src/data/projects.ts';
import { createDomain } from '../../src/data/domains.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

describe('tasks', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('createTask writes a task with default open status and a float order', () => {
    const d = createDomain(store, { name: 'D' });
    const p = createProject(store, { name: 'P', domainId: d });
    const t = createTask(store, { title: 'Book flights', projectId: p });
    const task = getTask(store, t);
    expect(task?.title).toBe('Book flights');
    expect(task?.projectId).toBe(p);
    expect(task?.status).toBe(TASK_STATUS.open);
    expect(Number.isFinite(task?.order)).toBe(true);
  });

  it('createTask appends after existing siblings via nextTaskOrder', () => {
    const d = createDomain(store, { name: 'D' });
    const p = createProject(store, { name: 'P', domainId: d });
    const t0 = createTask(store, { title: 't0', projectId: p, order: 0 });
    const t1 = createTask(store, { title: 't1', projectId: p });
    const o0 = getTask(store, t0)?.order ?? 0;
    const o1 = getTask(store, t1)?.order ?? 0;
    expect(o1).toBeGreaterThan(o0);
  });

  it('nextTaskOrder returns 0 for an empty sibling set', () => {
    const d = createDomain(store, { name: 'D' });
    const p = createProject(store, { name: 'P', domainId: d });
    expect(nextTaskOrder(store, p, null)).toBe(0);
  });

  it('setTaskStatus toggles open <-> done', () => {
    const d = createDomain(store, { name: 'D' });
    const p = createProject(store, { name: 'P', domainId: d });
    const t = createTask(store, { title: 't', projectId: p });
    setTaskStatus(store, t, TASK_STATUS.done);
    expect(getTask(store, t)?.status).toBe(TASK_STATUS.done);
    setTaskStatus(store, t, TASK_STATUS.open);
    expect(getTask(store, t)?.status).toBe(TASK_STATUS.open);
  });

  it('updateTask patches title / projectId / parentTaskId', () => {
    const d = createDomain(store, { name: 'D' });
    const p1 = createProject(store, { name: 'P1', domainId: d });
    const p2 = createProject(store, { name: 'P2', domainId: d });
    const t = createTask(store, { title: 't', projectId: p1 });
    updateTask(store, t, { title: 'renamed', projectId: p2 });
    const after = getTask(store, t);
    expect(after?.title).toBe('renamed');
    expect(after?.projectId).toBe(p2);
    updateTask(store, t, { projectId: null });
    expect(getTask(store, t)?.projectId).toBeNull();
  });

  it('getChildTasks returns direct sub-tasks of a parent', () => {
    const d = createDomain(store, { name: 'D' });
    const p = createProject(store, { name: 'P', domainId: d });
    const t = createTask(store, { title: 'parent', projectId: p });
    const c1 = createTask(store, { title: 'c1', projectId: p, parentTaskId: t });
    createTask(store, { title: 'other', projectId: p });
    expect(getChildTasks(store, t)).toEqual([c1]);
  });

  it('deleteTask does NOT cascade — children keep parentTaskId and surface as orphans', () => {
    const d = createDomain(store, { name: 'D' });
    const p = createProject(store, { name: 'P', domainId: d });
    const t = createTask(store, { title: 'parent', projectId: p });
    const c1 = createTask(store, { title: 'c1', projectId: p, parentTaskId: t });
    deleteTask(store, t);
    const child = getTask(store, c1);
    expect(child?.parentTaskId).toBe(t);
    expect(isTaskOrphaned(store, c1)).toBe(true);
    expect(getOrphanedTaskIds(store)).toContain(c1);
  });

  it('getTasksForProject returns top-level tasks plus orphans for a project', () => {
    const d = createDomain(store, { name: 'D' });
    const p = createProject(store, { name: 'P', domainId: d });
    const top = createTask(store, { title: 'top', projectId: p });
    const t2 = createTask(store, { title: 'top2', projectId: p });
    createTask(store, { title: 'child', projectId: p, parentTaskId: top });
    expect(getTasksForProject(store, p).sort()).toEqual([top, t2].sort());
  });

  it('getTask returns a normalised entity', () => {
    const d = createDomain(store, { name: 'D' });
    const p = createProject(store, { name: 'P', domainId: d });
    const t = createTask(store, { title: 't', projectId: p });
    const task = getTask(store, t);
    expect(task).toMatchObject({ id: t, title: 't', projectId: p, parentTaskId: null, status: TASK_STATUS.open });
    expect(getTask(store, 'nope')).toBeUndefined();
  });
});
