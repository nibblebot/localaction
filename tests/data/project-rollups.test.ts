import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { getProjectRollups } from '../../src/data/selectors.ts';
import { createProject } from '../../src/data/projects.ts';
import { createArea } from '../../src/data/areas.ts';
import { createTask, setTaskStatus } from '../../src/data/tasks.ts';
import { TASK_STATUS } from '../../src/data/schema.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

describe('getProjectRollups', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('counts subtasks recursively in done/total', () => {
    const p = createProject(store, { name: 'P', areaId: createArea(store, { name: 'A' }) });
    const t1 = createTask(store, { title: 'top1', placement: { kind: 'project', id: p } });
    createTask(store, { title: 'top2', placement: { kind: 'project', id: p } });
    const s1 = createTask(store, { title: 'sub1', placement: { kind: 'task', id: t1 } });
    const s2 = createTask(store, { title: 'sub2', placement: { kind: 'task', id: s1 } });
    setTaskStatus(store, s2, TASK_STATUS.done);
    setTaskStatus(store, s1, TASK_STATUS.done);

    const rollup = getProjectRollups(store).find((r) => r.projectId === p);
    // All four tasks count: two top-level + two nested. s1 is effectively
    // done because its only child s2 is done.
    expect(rollup?.total).toBe(4);
    expect(rollup?.done).toBe(2);
  });

  it('does not count a stored-done parent while a descendant is open', () => {
    const p = createProject(store, { name: 'P', areaId: createArea(store, { name: 'A' }) });
    const t1 = createTask(store, { title: 'top1', placement: { kind: 'project', id: p } });
    const s1 = createTask(store, { title: 'sub1', placement: { kind: 'task', id: t1 } });
    setTaskStatus(store, t1, TASK_STATUS.done);
    void s1;

    const rollup = getProjectRollups(store).find((r) => r.projectId === p);
    expect(rollup?.total).toBe(2);
    expect(rollup?.done).toBe(0);
  });
});
