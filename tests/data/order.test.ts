import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES } from '../../src/data/schema.ts';
import { createArea } from '../../src/data/areas.ts';
import { createProject } from '../../src/data/projects.ts';
import { createTask } from '../../src/data/tasks.ts';
import {
  moveArea,
  moveTask,
  reorderProject,
  moveProjectToStatus,
  backfillOrder,
  readSiblingOrders,
} from '../../src/data/order.ts';
import { PROJECT_STATUS } from '../../src/data/schema.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

function order(store: MergeableStore, table: string, id: string): number {
  return Number(store.getCell(table, id, COLUMNS.areas.order as string));
}

function areaOrder(store: MergeableStore, parentId: string | null): string[] {
  return readSiblingOrders(store, TABLES.areas, COLUMNS.areas.parentId, parentId).map(
    (s) => s.id,
  );
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

describe('reorderProject', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('moves a project before another within the same area', () => {
    const d = createArea(store, { name: 'D' });
    const p1 = createProject(store, { name: 'P1', areaId: d });
    const p2 = createProject(store, { name: 'P2', areaId: d });
    const p3 = createProject(store, { name: 'P3', areaId: d });
    reorderProject(store, p3, p1);
    const siblings = readSiblingOrders(store, TABLES.projects, COLUMNS.projects.areaId, d);
    expect(siblings.map((s) => s.id)).toEqual([p3, p1, p2]);
  });

  it('does not move a project across areas', () => {
    const a = createArea(store, { name: 'A' });
    const b = createArea(store, { name: 'B' });
    const pA = createProject(store, { name: 'pA', areaId: a });
    const pB = createProject(store, { name: 'pB', areaId: b });
    reorderProject(store, pA, pB);
    expect(store.getCell(TABLES.projects, pA, COLUMNS.projects.areaId)).toBe(a);
  });
});

describe('moveProjectToStatus', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('stores the backlog status and lands at the given position in one write', () => {
    const d = createArea(store, { name: 'D' });
    const p1 = createProject(store, { name: 'P1', areaId: d });
    const p2 = createProject(store, { name: 'P2', areaId: d });
    const p3 = createProject(store, { name: 'P3', areaId: d });
    moveProjectToStatus(store, p1, PROJECT_STATUS.backlog, p3);
    expect(store.getCell(TABLES.projects, p1, COLUMNS.projects.status)).toBe('backlog');
    const siblings = readSiblingOrders(store, TABLES.projects, COLUMNS.projects.areaId, d);
    expect(siblings.map((s) => s.id)).toEqual([p2, p1, p3]);
  });

  it('restoring to active clears the status cell back to absent', () => {
    const d = createArea(store, { name: 'D' });
    const p = createProject(store, { name: 'P', areaId: d });
    moveProjectToStatus(store, p, PROJECT_STATUS.backlog, undefined);
    expect(store.hasCell(TABLES.projects, p, COLUMNS.projects.status)).toBe(true);
    moveProjectToStatus(store, p, PROJECT_STATUS.active, undefined);
    expect(store.hasCell(TABLES.projects, p, COLUMNS.projects.status)).toBe(false);
  });

  it('refuses a missing project or a beforeId outside the store', () => {
    const d = createArea(store, { name: 'D' });
    const p = createProject(store, { name: 'P', areaId: d });
    moveProjectToStatus(store, 'missing', PROJECT_STATUS.backlog, undefined);
    moveProjectToStatus(store, p, PROJECT_STATUS.backlog, 'missing');
    expect(store.hasCell(TABLES.projects, p, COLUMNS.projects.status)).toBe(false);
  });
});

describe('moveTask', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('moves a top-level task before another in the same project', () => {
    const d = createArea(store, { name: 'D' });
    const p = createProject(store, { name: 'P', areaId: d });
    const t1 = createTask(store, { title: 't1', placement: { kind: 'project', id: p } });
    const t2 = createTask(store, { title: 't2', placement: { kind: 'project', id: p } });
    const t3 = createTask(store, { title: 't3', placement: { kind: 'project', id: p } });
    moveTask(store, t3, `project:${p}`, t1);
    expect(taskOrder(store, `project:${p}`)).toEqual([t3, t1, t2]);
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
    const child = createTask(store, { title: 'child', placement: { kind: 'task', id: parent } });
    const inbox = createTask(store, { title: 'inbox' });
    moveTask(store, child, null, inbox);
    expect(store.getCell(TABLES.tasks, child, COLUMNS.tasks.placement)).toBeUndefined();
    expect(taskOrder(store, null)).toEqual([parent, child, inbox]);
    expect(taskOrder(store, `task:${parent}`)).toEqual([]);
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
    const grandchild = createTask(store, { title: 'grandchild', placement: { kind: 'task', id: child } });
    moveTask(store, t, `task:${grandchild}`, undefined);
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.placement)).toBeUndefined();
    expect(taskOrder(store, `task:${grandchild}`)).toEqual([]);
  });

  it('refuses a missing parent task', () => {
    const t = createTask(store, { title: 't' });
    moveTask(store, t, 'task:missing', undefined);
    expect(store.getCell(TABLES.tasks, t, COLUMNS.tasks.placement)).toBeUndefined();
  });

  it('refuses a missing project', () => {
    const t = createTask(store, { title: 't' });
    moveTask(store, t, 'project:missing', undefined);
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

describe('backfillOrder', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('fills `order` on legacy rows that have none', () => {
    const d = createArea(store, { name: 'D' });
    const p = createProject(store, { name: 'P', areaId: d });
    store.delCell(TABLES.areas, d, COLUMNS.areas.order);
    store.delCell(TABLES.projects, p, COLUMNS.projects.order);
    backfillOrder(store);
    expect(order(store, TABLES.areas, d)).toBeGreaterThan(0);
    expect(order(store, TABLES.projects, p)).toBeGreaterThan(0);
  });

  it('is idempotent — running twice does not change `order`', () => {
    const d = createArea(store, { name: 'D' });
    const p = createProject(store, { name: 'P', areaId: d });
    backfillOrder(store);
    const dOrder = order(store, TABLES.areas, d);
    const pOrder = order(store, TABLES.projects, p);
    backfillOrder(store);
    expect(order(store, TABLES.areas, d)).toBe(dOrder);
    expect(order(store, TABLES.projects, p)).toBe(pOrder);
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
