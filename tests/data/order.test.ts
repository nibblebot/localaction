import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES } from '../../src/data/schema.ts';
import { createArea } from '../../src/data/areas.ts';
import { createProject } from '../../src/data/projects.ts';
import { createTask } from '../../src/data/tasks.ts';
import {
  reorderArea,
  reorderProject,
  reorderTask,
  backfillOrder,
  readSiblingOrders,
} from '../../src/data/order.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

function order(store: MergeableStore, table: string, id: string): number {
  return Number(store.getCell(table, id, COLUMNS.areas.order as string));
}

describe('reorderArea', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('moves an area before another sibling (parent unchanged)', () => {
    const d = createArea(store, { name: 'D' });
    const a = createArea(store, { name: 'A' });
    const b = createArea(store, { name: 'B' });
    const c = createArea(store, { name: 'C' });
    reorderArea(store, d, a);
    const siblings = readSiblingOrders(store, TABLES.areas, COLUMNS.areas.parentId, null);
    expect(siblings.map((s) => s.id)).toEqual([d, a, b, c]);
    expect(siblings[0]!.order).toBeLessThan(siblings[1]!.order);
    expect(order(store, TABLES.areas, d)).toBeLessThan(order(store, TABLES.areas, a));
  });

  it('moves an area to the end when beforeId is undefined', () => {
    const a = createArea(store, { name: 'A' });
    const b = createArea(store, { name: 'B' });
    const c = createArea(store, { name: 'C' });
    reorderArea(store, a, undefined);
    const siblings = readSiblingOrders(store, TABLES.areas, COLUMNS.areas.parentId, null);
    expect(siblings.map((s) => s.id)).toEqual([b, c, a]);
    expect(order(store, TABLES.areas, a)).toBeGreaterThan(order(store, TABLES.areas, c));
  });

  it('keeps sub-areas under the same parent when reordering a parent', () => {
    const parent = createArea(store, { name: 'Parent' });
    const other = createArea(store, { name: 'Other' });
    const child = createArea(store, { name: 'Child', parentId: parent });
    reorderArea(store, parent, other);
    expect(store.getCell(TABLES.areas, child, COLUMNS.areas.parentId)).toBe(parent);
  });

  it('reorders within the parent scope only (not across parents)', () => {
    const a = createArea(store, { name: 'A' });
    const b = createArea(store, { name: 'B' });
    const subA = createArea(store, { name: 'subA', parentId: a });
    const subB = createArea(store, { name: 'subB', parentId: b });
    reorderArea(store, subA, subB);
    expect(store.getCell(TABLES.areas, subA, COLUMNS.areas.parentId)).toBe(a);
  });

  it('reorders sub-areas within their parent', () => {
    const parent = createArea(store, { name: 'Parent' });
    const x = createArea(store, { name: 'X', parentId: parent });
    const y = createArea(store, { name: 'Y', parentId: parent });
    const z = createArea(store, { name: 'Z', parentId: parent });
    reorderArea(store, z, x);
    const siblings = readSiblingOrders(store, TABLES.areas, COLUMNS.areas.parentId, parent);
    expect(siblings.map((s) => s.id)).toEqual([z, x, y]);
  });

  it('is a no-op for missing ids', () => {
    const a = createArea(store, { name: 'A' });
    const before = order(store, TABLES.areas, a);
    reorderArea(store, 'missing', a);
    expect(order(store, TABLES.areas, a)).toBe(before);
  });

  it('survives many consecutive reorders without collapsing precision', () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push(createArea(store, { name: `D${i}` }));
    }
    for (let i = 0; i < 200; i += 1) {
      reorderArea(store, ids[ids.length - 1]!, ids[0]!);
    }
    const final = readSiblingOrders(store, TABLES.areas, COLUMNS.areas.parentId, null);
    expect(final.map((s) => s.id)).toEqual([ids[ids.length - 1]!, ...ids.slice(0, -1)]);
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

describe('reorderTask', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('moves a top-level task before another in the same project', () => {
    const d = createArea(store, { name: 'D' });
    const p = createProject(store, { name: 'P', areaId: d });
    const t1 = createTask(store, { title: 't1', projectId: p });
    const t2 = createTask(store, { title: 't2', projectId: p });
    const t3 = createTask(store, { title: 't3', projectId: p });
    reorderTask(store, t3, t1);
    const siblings = readSiblingOrders(
      store,
      TABLES.tasks,
      COLUMNS.tasks.parentTaskId,
      null,
    ).filter((s) => store.getCell(TABLES.tasks, s.id, COLUMNS.tasks.projectId) === p);
    expect(siblings.map((s) => s.id)).toEqual([t3, t1, t2]);
  });

  it('moves a child task within its parent', () => {
    const d = createArea(store, { name: 'D' });
    const p = createProject(store, { name: 'P', areaId: d });
    const parent = createTask(store, { title: 'parent', projectId: p });
    const c1 = createTask(store, { title: 'c1', projectId: p, parentTaskId: parent });
    const c2 = createTask(store, { title: 'c2', projectId: p, parentTaskId: parent });
    reorderTask(store, c2, c1);
    const siblings = readSiblingOrders(store, TABLES.tasks, COLUMNS.tasks.parentTaskId, parent);
    expect(siblings.map((s) => s.id)).toEqual([c2, c1]);
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
    const siblings = readSiblingOrders(store, TABLES.areas, COLUMNS.areas.parentId, parent);
    expect(siblings.map((s) => s.id)).toEqual([a, b, c]);
  });
});
