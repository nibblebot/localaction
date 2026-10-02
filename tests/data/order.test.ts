import { describe, expect, it, beforeEach } from 'bun:test';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES, TASK_STATUS } from '../../src/data/schema.ts';
import { createArea } from '../../src/data/areas.ts';
import { createTask, setTaskStatus, getDerivedStatus } from '../../src/data/tasks.ts';
import {
  moveArea,
  moveTask,
  moveRootToBacklog,
  backfillOrder,
  readSiblingOrders,
} from '../../src/data/order.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

function order(store: MergeableStore, table: string, id: string): number {
  return Number(store.getCell(table, id, COLUMNS.areas.order as string));
}

function areaOrder(store: MergeableStore, parentId: string | null): string[] {
  return readSiblingOrders(store, TABLES.areas, COLUMNS.areas.parentId, parentId).map((s) => s.id);
}

function taskOrder(store: MergeableStore, placement: string | null): string[] {
  return readSiblingOrders(store, TABLES.tasks, COLUMNS.tasks.placement, placement).map(
    (s) => s.id,
  );
}

describe('moveArea', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('moves an area before another sibling (parent unchanged)', () => {
    const d = createArea(store, { name: 'D' });
    const a = createArea(store, { name: 'A' });
    const b = createArea(store, { name: 'B' });
    const c = createArea(store, { name: 'C' });
    moveArea(store, d, null, a);
    const siblings = readSiblingOrders(store, TABLES.areas, COLUMNS.areas.parentId, null);
    expect(siblings.map((s) => s.id)).toEqual([d, a, b, c]);
    expect(siblings[0]!.order).toBeLessThan(siblings[1]!.order);
    expect(order(store, TABLES.areas, d)).toBeLessThan(order(store, TABLES.areas, a));
  });

  it('moves an area to the end when beforeId is undefined', () => {
    const a = createArea(store, { name: 'A' });
    const b = createArea(store, { name: 'B' });
    const c = createArea(store, { name: 'C' });
    moveArea(store, a, null, undefined);
    expect(areaOrder(store, null)).toEqual([b, c, a]);
    expect(order(store, TABLES.areas, a)).toBeGreaterThan(order(store, TABLES.areas, c));
  });

  it('keeps sub-areas under the same parent when moving a parent', () => {
    const parent = createArea(store, { name: 'Parent' });
    const other = createArea(store, { name: 'Other' });
    const child = createArea(store, { name: 'Child', parentId: parent });
    moveArea(store, parent, null, other);
    expect(store.getCell(TABLES.areas, child, COLUMNS.areas.parentId)).toBe(parent);
  });

  it('reorders sub-areas within their parent', () => {
    const parent = createArea(store, { name: 'Parent' });
    const x = createArea(store, { name: 'X', parentId: parent });
    const y = createArea(store, { name: 'Y', parentId: parent });
    const z = createArea(store, { name: 'Z', parentId: parent });
    moveArea(store, z, parent, x);
    expect(areaOrder(store, parent)).toEqual([z, x, y]);
  });

  it('reparents a root area under another area, ordered within the new group', () => {
    const a = createArea(store, { name: 'A' });
    const b = createArea(store, { name: 'B' });
    const subB = createArea(store, { name: 'subB', parentId: b });
    moveArea(store, a, b, subB);
    expect(store.getCell(TABLES.areas, a, COLUMNS.areas.parentId)).toBe(b);
    expect(areaOrder(store, b)).toEqual([a, subB]);
    expect(areaOrder(store, null)).toEqual([b]);
  });

  it('promotes a sub-area to the root at the requested position', () => {
    const a = createArea(store, { name: 'A' });
    const root = createArea(store, { name: 'Root' });
    const sub = createArea(store, { name: 'Sub', parentId: a });
    moveArea(store, sub, null, root);
    expect(store.getCell(TABLES.areas, sub, COLUMNS.areas.parentId)).toBeUndefined();
    expect(areaOrder(store, null)).toEqual([a, sub, root]);
    expect(areaOrder(store, a)).toEqual([]);
  });

  it('moves a sub-area to a different parent', () => {
    const a = createArea(store, { name: 'A' });
    const b = createArea(store, { name: 'B' });
    const subA = createArea(store, { name: 'subA', parentId: a });
    const subB = createArea(store, { name: 'subB', parentId: b });
    moveArea(store, subA, b, subB);
    expect(store.getCell(TABLES.areas, subA, COLUMNS.areas.parentId)).toBe(b);
    expect(areaOrder(store, b)).toEqual([subA, subB]);
  });

  it('moves a parent with its subtree to a new parent', () => {
    const parent = createArea(store, { name: 'Parent' });
    const child = createArea(store, { name: 'Child', parentId: parent });
    const host = createArea(store, { name: 'Host' });
    moveArea(store, parent, host, undefined);
    expect(store.getCell(TABLES.areas, parent, COLUMNS.areas.parentId)).toBe(host);
    expect(store.getCell(TABLES.areas, child, COLUMNS.areas.parentId)).toBe(parent);
  });

  it('refuses to parent an area under itself', () => {
    const a = createArea(store, { name: 'A' });
    const before = order(store, TABLES.areas, a);
    moveArea(store, a, a, undefined);
    expect(store.getCell(TABLES.areas, a, COLUMNS.areas.parentId)).toBeUndefined();
    expect(order(store, TABLES.areas, a)).toBe(before);
  });

  it('refuses to parent an area under its own descendant (cycle)', () => {
    const a = createArea(store, { name: 'A' });
    const child = createArea(store, { name: 'Child', parentId: a });
    const grandchild = createArea(store, { name: 'Grandchild', parentId: child });
    moveArea(store, a, grandchild, undefined);
    expect(store.getCell(TABLES.areas, a, COLUMNS.areas.parentId)).toBeUndefined();
    expect(areaOrder(store, grandchild)).toEqual([]);
  });

  it('refuses a missing target parent', () => {
    const a = createArea(store, { name: 'A' });
    moveArea(store, a, 'missing', undefined);
    expect(store.getCell(TABLES.areas, a, COLUMNS.areas.parentId)).toBeUndefined();
  });

  it('is a no-op for missing ids', () => {
    const a = createArea(store, { name: 'A' });
    const before = order(store, TABLES.areas, a);
    moveArea(store, 'missing', null, a);
    expect(order(store, TABLES.areas, a)).toBe(before);
  });

  it('survives many consecutive moves without collapsing precision', () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push(createArea(store, { name: `D${i}` }));
    }
    for (let i = 0; i < 200; i += 1) {
      moveArea(store, ids[ids.length - 1]!, null, ids[0]!);
    }
    expect(areaOrder(store, null)).toEqual([ids[ids.length - 1]!, ...ids.slice(0, -1)]);
  });
});

describe('moveTask', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('moves a top-level task before another in the same area', () => {
    const a = createArea(store, { name: 'A' });
    const t1 = createTask(store, { title: 't1', placement: { kind: 'area', id: a } });
    const t2 = createTask(store, { title: 't2', placement: { kind: 'area', id: a } });
    const t3 = createTask(store, { title: 't3', placement: { kind: 'area', id: a } });
    moveTask(store, t3, `area:${a}`, t1);
    expect(taskOrder(store, `area:${a}`)).toEqual([t3, t1, t2]);
  });

  it('moves a child task within its parent', () => {
    const parent = createTask(store, { title: 'parent' });
    const c1 = createTask(store, { title: 'c1', placement: { kind: 'task', id: parent } });
    const c2 = createTask(store, { title: 'c2', placement: { kind: 'task', id: parent } });
    moveTask(store, c2, `task:${parent}`, c1);
    expect(taskOrder(store, `task:${parent}`)).toEqual([c2, c1]);
  });

  it('reparents a top-level task under another task', () => {
    const parent = createTask(store, { title: 'parent' });
    const child = createTask(store, { title: 'child', placement: { kind: 'task', id: parent } });
    const t = createTask(store, { title: 't' });
    moveTask(store, t, `task:${parent}`, child);
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.placement)).toBe(`task:${parent}`);
    expect(taskOrder(store, `task:${parent}`)).toEqual([t, child]);
    expect(taskOrder(store, null)).toEqual([parent]);
  });

  it('promotes a sub-task to the inbox root (null placement)', () => {
    const parent = createTask(store, { title: 'parent' });
    const c1 = createTask(store, { title: 'c1', placement: { kind: 'task', id: parent } });
    const c2 = createTask(store, { title: 'c2', placement: { kind: 'task', id: parent } });
    const inbox = createTask(store, { title: 'inbox' });
    moveTask(store, c1, null, inbox);
    expect(store.getCell(TABLES.tasks, c1, COLUMNS.tasks.placement)).toBeUndefined();
    expect(taskOrder(store, null)).toEqual([parent, c1, inbox]);
    expect(taskOrder(store, `task:${parent}`)).toEqual([c2]);
  });

  it('moves a task with its subtree to a new parent', () => {
    const parent = createTask(store, { title: 'parent' });
    const child = createTask(store, { title: 'child', placement: { kind: 'task', id: parent } });
    const host = createTask(store, { title: 'host' });
    moveTask(store, parent, `task:${host}`, undefined);
    expect(store.getCell(TABLES.tasks, parent, COLUMNS.tasks.placement)).toBe(`task:${host}`);
    expect(store.getCell(TABLES.tasks, child, COLUMNS.tasks.placement)).toBe(`task:${parent}`);
  });

  it('refuses to parent a task under itself', () => {
    const t = createTask(store, { title: 't' });
    moveTask(store, t, `task:${t}`, undefined);
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.placement)).toBeUndefined();
  });

  it('refuses to parent a task under its own descendant (cycle)', () => {
    const t = createTask(store, { title: 't' });
    const child = createTask(store, { title: 'child', placement: { kind: 'task', id: t } });
    const grandchild = createTask(store, {
      title: 'grandchild',
      placement: { kind: 'task', id: child },
    });
    moveTask(store, t, `task:${grandchild}`, undefined);
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.placement)).toBeUndefined();
    expect(taskOrder(store, `task:${grandchild}`)).toEqual([]);
  });

  it('refuses a missing parent task', () => {
    const t = createTask(store, { title: 't' });
    moveTask(store, t, 'task:missing', undefined);
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.placement)).toBeUndefined();
  });

  it('refuses a missing area parent', () => {
    const t = createTask(store, { title: 't' });
    moveTask(store, t, 'area:missing', undefined);
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.placement)).toBeUndefined();
  });

  it('refuses an unknown placement kind', () => {
    const t = createTask(store, { title: 't' });
    moveTask(store, t, 'bogus:abc', undefined);
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.placement)).toBeUndefined();
  });

  it('is a no-op for missing ids', () => {
    const t = createTask(store, { title: 't' });
    const before = order(store, TABLES.tasks, t);
    moveTask(store, 'missing', null, t);
    expect(order(store, TABLES.tasks, t)).toBe(before);
  });
});

describe('moveTask conversion snapshot', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('moving out the last child snapshots the ex-parent derived status into its stored cell', () => {
    const parent = createTask(store, { title: 'parent' });
    const child = createTask(store, {
      title: 'child',
      placement: { kind: 'task', id: parent },
    });
    setTaskStatus(store, child, TASK_STATUS.done);
    // The parent's stored cell stays open but it derives done via the
    // only child. Moving the child out converts the parent to a leaf.
    expect(getDerivedStatus(store, parent)).toBe(TASK_STATUS.done);
    moveTask(store, child, null, undefined);
    expect(store.getCell(TABLES.tasks, child, COLUMNS.tasks.placement)).toBeUndefined();
    expect(taskOrder(store, `task:${parent}`)).toEqual([]);
    // The ex-parent's stored cell must carry the snapshotted derived
    // status (done) with a completedAt stamp.
    expect(store.getCell(TABLES.tasks, parent, COLUMNS.tasks.status)).toBe(TASK_STATUS.done);
    expect(store.hasCell(TABLES.tasks, parent, COLUMNS.tasks.completedAt)).toBe(true);
    expect(getDerivedStatus(store, parent)).toBe(TASK_STATUS.done);
  });

  it('moving out the last open child snapshots the ex-parent as open', () => {
    const parent = createTask(store, { title: 'parent' });
    const child = createTask(store, {
      title: 'child',
      placement: { kind: 'task', id: parent },
    });
    // A stored-done parent with an open child derives open. Moving the
    // last child out converts the parent to a leaf, so the derived-open
    // status is snapshotted into its stored cell (overwriting done).
    setTaskStatus(store, parent, TASK_STATUS.done);
    expect(getDerivedStatus(store, parent)).toBe(TASK_STATUS.open);
    moveTask(store, child, null, undefined);
    expect(taskOrder(store, `task:${parent}`)).toEqual([]);
    expect(store.getCell(TABLES.tasks, parent, COLUMNS.tasks.status)).toBe(TASK_STATUS.open);
    expect(getDerivedStatus(store, parent)).toBe(TASK_STATUS.open);
  });

  it('does not snapshot when the parent still has other children', () => {
    const parent = createTask(store, { title: 'parent' });
    const c1 = createTask(store, { title: 'c1', placement: { kind: 'task', id: parent } });
    const c2 = createTask(store, { title: 'c2', placement: { kind: 'task', id: parent } });
    setTaskStatus(store, c2, TASK_STATUS.done);
    moveTask(store, c1, null, undefined);
    // c2 still parents under `parent`, so no conversion snapshot is
    // written. The tell is completedAt: a done snapshot would stamp it,
    // and a still-parented task is never stamped.
    expect(taskOrder(store, `task:${parent}`)).toEqual([c2]);
    expect(store.hasCell(TABLES.tasks, parent, COLUMNS.tasks.completedAt)).toBe(false);
  });
});

describe('moveRootToBacklog', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('shelves a root: sets the backlog cell and repositions within the sibling group', () => {
    const r1 = createTask(store, { title: 'r1' });
    const r2 = createTask(store, { title: 'r2' });
    const r3 = createTask(store, { title: 'r3' });
    moveRootToBacklog(store, r1, true, r3);
    expect(store.hasCell(TABLES.tasks, r1, COLUMNS.tasks.backlog)).toBe(true);
    expect(taskOrder(store, null)).toEqual([r2, r1, r3]);
  });

  it('shelving to the end uses undefined beforeId', () => {
    const r1 = createTask(store, { title: 'r1' });
    const r2 = createTask(store, { title: 'r2' });
    const r3 = createTask(store, { title: 'r3' });
    moveRootToBacklog(store, r1, true, undefined);
    expect(taskOrder(store, null)).toEqual([r2, r3, r1]);
  });

  it('restoring to active clears the backlog cell back to absent and repositions', () => {
    const r1 = createTask(store, { title: 'r1' });
    const r2 = createTask(store, { title: 'r2' });
    moveRootToBacklog(store, r1, true, undefined);
    expect(store.hasCell(TABLES.tasks, r1, COLUMNS.tasks.backlog)).toBe(true);
    moveRootToBacklog(store, r1, false, r2);
    expect(store.hasCell(TABLES.tasks, r1, COLUMNS.tasks.backlog)).toBe(false);
    expect(taskOrder(store, null)).toEqual([r1, r2]);
  });

  it('keeps the placement string unchanged (shelf does not reparent)', () => {
    const a = createArea(store, { name: 'A' });
    const root = createTask(store, { title: 'r', placement: { kind: 'area', id: a } });
    moveRootToBacklog(store, root, true, undefined);
    expect(store.getCell(TABLES.tasks, root, COLUMNS.tasks.placement)).toBe(`area:${a}`);
    expect(store.hasCell(TABLES.tasks, root, COLUMNS.tasks.backlog)).toBe(true);
  });

  it('is a no-op for a missing root id', () => {
    const r = createTask(store, { title: 'r' });
    const before = order(store, TABLES.tasks, r);
    moveRootToBacklog(store, 'missing', true, undefined);
    expect(order(store, TABLES.tasks, r)).toBe(before);
  });
});

describe('backfillOrder', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('fills `order` on legacy area and task rows that have none', () => {
    const a = createArea(store, { name: 'A' });
    const t = createTask(store, { title: 'T', placement: { kind: 'area', id: a } });
    store.delCell(TABLES.areas, a, COLUMNS.areas.order);
    store.delCell(TABLES.tasks, t, COLUMNS.tasks.order);
    backfillOrder(store);
    expect(order(store, TABLES.areas, a)).toBeGreaterThan(0);
    expect(order(store, TABLES.tasks, t)).toBeGreaterThan(0);
  });

  it('is idempotent — running twice does not change `order`', () => {
    const a = createArea(store, { name: 'A' });
    const t = createTask(store, { title: 'T', placement: { kind: 'area', id: a } });
    backfillOrder(store);
    const aOrder = order(store, TABLES.areas, a);
    const tOrder = order(store, TABLES.tasks, t);
    backfillOrder(store);
    expect(order(store, TABLES.areas, a)).toBe(aOrder);
    expect(order(store, TABLES.tasks, t)).toBe(tOrder);
  });

  it('orders siblings by createdAt within a parent scope', () => {
    const parent = createArea(store, { name: 'Parent' });
    const a = createArea(store, { name: 'A', parentId: parent });
    const b = createArea(store, { name: 'B', parentId: parent });
    const c = createArea(store, { name: 'C', parentId: parent });
    store.setCell(TABLES.areas, a, 'createdAt', '2000-01-01T00:00:00.000Z');
    store.setCell(TABLES.areas, b, 'createdAt', '2001-01-01T00:00:00.000Z');
    store.setCell(TABLES.areas, c, 'createdAt', '2002-01-01T00:00:00.000Z');
    store.delCell(TABLES.areas, a, COLUMNS.areas.order);
    store.delCell(TABLES.areas, b, COLUMNS.areas.order);
    store.delCell(TABLES.areas, c, COLUMNS.areas.order);
    backfillOrder(store);
    expect(areaOrder(store, parent)).toEqual([a, b, c]);
  });
});
