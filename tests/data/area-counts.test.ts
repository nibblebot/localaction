import { describe, expect, it, beforeEach } from 'bun:test';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { TASK_STATUS } from '../../src/data/schema.ts';
import { createArea } from '../../src/data/areas.ts';
import { createTask, setTaskStatus } from '../../src/data/tasks.ts';
import { getAreaCounts } from '../../src/data/selectors.ts';

function areaCounts(store: MergeableStore, areaId: string) {
  const row = getAreaCounts(store).find((c) => c.id === areaId);
  if (!row) throw new Error(`area ${areaId} missing from counts`);
  return row;
}

describe('getAreaCounts open-task counts', () => {
  let store: MergeableStore;
  let area: string;
  beforeEach(() => {
    store = createMergeableStore();
    area = createArea(store, { name: 'Work' });
  });

  it('taskCount covers every task; openTaskCount skips a done leaf', () => {
    const open = createTask(store, { title: 'open', placement: { kind: 'area', id: area } });
    const done = createTask(store, { title: 'done', placement: { kind: 'area', id: area } });
    setTaskStatus(store, done, TASK_STATUS.done);
    const counts = areaCounts(store, area);
    expect(counts.taskCount).toBe(2);
    expect(counts.openTaskCount).toBe(1);
    void open;
  });

  it('a stored-done parent with an open child stays effectively open', () => {
    const parent = createTask(store, { title: 'parent', placement: { kind: 'area', id: area } });
    createTask(store, { title: 'child', placement: { kind: 'task', id: parent } });
    setTaskStatus(store, parent, TASK_STATUS.done);
    const counts = areaCounts(store, area);
    expect(counts.taskCount).toBe(2);
    expect(counts.openTaskCount).toBe(2);
  });

  it('a parent is effectively done once every child is done', () => {
    const parent = createTask(store, { title: 'parent', placement: { kind: 'area', id: area } });
    const child = createTask(store, { title: 'child', placement: { kind: 'task', id: parent } });
    setTaskStatus(store, child, TASK_STATUS.done);
    setTaskStatus(store, parent, TASK_STATUS.done);
    const counts = areaCounts(store, area);
    expect(counts.taskCount).toBe(2);
    expect(counts.openTaskCount).toBe(0);
  });

  it('open counts roll up from sub-areas to the parent area', () => {
    const sub = createArea(store, { name: 'Sub', parentId: area });
    const done = createTask(store, { title: 'done', placement: { kind: 'area', id: sub } });
    createTask(store, { title: 'open', placement: { kind: 'area', id: sub } });
    setTaskStatus(store, done, TASK_STATUS.done);
    const parentCounts = areaCounts(store, area);
    expect(parentCounts.taskCount).toBe(2);
    expect(parentCounts.openTaskCount).toBe(1);
  });
});
