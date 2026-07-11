import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES } from '../../src/data/schema.ts';
import { createDomain } from '../../src/data/domains.ts';
import { createProject } from '../../src/data/projects.ts';
import { createTask } from '../../src/data/tasks.ts';
import {
  reorderDomain,
  reorderProject,
  reorderTask,
  backfillOrder,
  readSiblingOrders,
} from '../../src/data/order.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

function order(store: MergeableStore, table: string, id: string): number {
  return Number(store.getCell(table, id, COLUMNS.domains.order as string));
}

describe('reorderDomain', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('moves a domain before another sibling (parent unchanged)', () => {
    const d = createDomain(store, { name: 'D' });
    const a = createDomain(store, { name: 'A' });
    const b = createDomain(store, { name: 'B' });
    const c = createDomain(store, { name: 'C' });
    reorderDomain(store, d, a);
    const siblings = readSiblingOrders(store, TABLES.domains, COLUMNS.domains.parentId, null);
    expect(siblings.map((s) => s.id)).toEqual([d, a, b, c]);
    expect(siblings[0]!.order).toBeLessThan(siblings[1]!.order);
    expect(order(store, TABLES.domains, d)).toBeLessThan(order(store, TABLES.domains, a));
  });

  it('moves a domain to the end when beforeId is undefined', () => {
    const a = createDomain(store, { name: 'A' });
    const b = createDomain(store, { name: 'B' });
    const c = createDomain(store, { name: 'C' });
    reorderDomain(store, a, undefined);
    const siblings = readSiblingOrders(store, TABLES.domains, COLUMNS.domains.parentId, null);
    expect(siblings.map((s) => s.id)).toEqual([b, c, a]);
    expect(order(store, TABLES.domains, a)).toBeGreaterThan(order(store, TABLES.domains, c));
  });

  it('keeps sub-domains under the same parent when reordering a parent', () => {
    const parent = createDomain(store, { name: 'Parent' });
    const other = createDomain(store, { name: 'Other' });
    const child = createDomain(store, { name: 'Child', parentId: parent });
    reorderDomain(store, parent, other);
    expect(store.getCell(TABLES.domains, child, COLUMNS.domains.parentId)).toBe(parent);
  });

  it('reorders within the parent scope only (not across parents)', () => {
    const a = createDomain(store, { name: 'A' });
    const b = createDomain(store, { name: 'B' });
    const subA = createDomain(store, { name: 'subA', parentId: a });
    const subB = createDomain(store, { name: 'subB', parentId: b });
    reorderDomain(store, subA, subB);
    expect(store.getCell(TABLES.domains, subA, COLUMNS.domains.parentId)).toBe(a);
  });

  it('reorders sub-domains within their parent', () => {
    const parent = createDomain(store, { name: 'Parent' });
    const x = createDomain(store, { name: 'X', parentId: parent });
    const y = createDomain(store, { name: 'Y', parentId: parent });
    const z = createDomain(store, { name: 'Z', parentId: parent });
    reorderDomain(store, z, x);
    const siblings = readSiblingOrders(store, TABLES.domains, COLUMNS.domains.parentId, parent);
    expect(siblings.map((s) => s.id)).toEqual([z, x, y]);
  });

  it('is a no-op for missing ids', () => {
    const a = createDomain(store, { name: 'A' });
    const before = order(store, TABLES.domains, a);
    reorderDomain(store, 'missing', a);
    expect(order(store, TABLES.domains, a)).toBe(before);
  });

  it('survives many consecutive reorders without collapsing precision', () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push(createDomain(store, { name: `D${i}` }));
    }
    for (let i = 0; i < 200; i += 1) {
      reorderDomain(store, ids[ids.length - 1]!, ids[0]!);
    }
    const final = readSiblingOrders(store, TABLES.domains, COLUMNS.domains.parentId, null);
    expect(final.map((s) => s.id)).toEqual([ids[ids.length - 1]!, ...ids.slice(0, -1)]);
  });
});

describe('reorderProject', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('moves a project before another within the same domain', () => {
    const d = createDomain(store, { name: 'D' });
    const p1 = createProject(store, { name: 'P1', domainId: d });
    const p2 = createProject(store, { name: 'P2', domainId: d });
    const p3 = createProject(store, { name: 'P3', domainId: d });
    reorderProject(store, p3, p1);
    const siblings = readSiblingOrders(store, TABLES.projects, COLUMNS.projects.domainId, d);
    expect(siblings.map((s) => s.id)).toEqual([p3, p1, p2]);
  });

  it('does not move a project across domains', () => {
    const a = createDomain(store, { name: 'A' });
    const b = createDomain(store, { name: 'B' });
    const pA = createProject(store, { name: 'pA', domainId: a });
    const pB = createProject(store, { name: 'pB', domainId: b });
    reorderProject(store, pA, pB);
    expect(store.getCell(TABLES.projects, pA, COLUMNS.projects.domainId)).toBe(a);
  });
});

describe('reorderTask', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('moves a top-level task before another in the same project', () => {
    const d = createDomain(store, { name: 'D' });
    const p = createProject(store, { name: 'P', domainId: d });
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
    const d = createDomain(store, { name: 'D' });
    const p = createProject(store, { name: 'P', domainId: d });
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
    const d = createDomain(store, { name: 'D' });
    const p = createProject(store, { name: 'P', domainId: d });
    store.delCell(TABLES.domains, d, COLUMNS.domains.order);
    store.delCell(TABLES.projects, p, COLUMNS.projects.order);
    backfillOrder(store);
    expect(order(store, TABLES.domains, d)).toBeGreaterThan(0);
    expect(order(store, TABLES.projects, p)).toBeGreaterThan(0);
  });

  it('is idempotent — running twice does not change `order`', () => {
    const d = createDomain(store, { name: 'D' });
    const p = createProject(store, { name: 'P', domainId: d });
    backfillOrder(store);
    const dOrder = order(store, TABLES.domains, d);
    const pOrder = order(store, TABLES.projects, p);
    backfillOrder(store);
    expect(order(store, TABLES.domains, d)).toBe(dOrder);
    expect(order(store, TABLES.projects, p)).toBe(pOrder);
  });

  it('orders siblings by createdAt within a parent scope', () => {
    const parent = createDomain(store, { name: 'Parent' });
    const a = createDomain(store, { name: 'A', parentId: parent });
    const b = createDomain(store, { name: 'B', parentId: parent });
    const c = createDomain(store, { name: 'C', parentId: parent });
    store.setCell(TABLES.domains, a, 'createdAt', '2000-01-01T00:00:00.000Z');
    store.setCell(TABLES.domains, b, 'createdAt', '2001-01-01T00:00:00.000Z');
    store.setCell(TABLES.domains, c, 'createdAt', '2002-01-01T00:00:00.000Z');
    store.delCell(TABLES.domains, a, COLUMNS.domains.order);
    store.delCell(TABLES.domains, b, COLUMNS.domains.order);
    store.delCell(TABLES.domains, c, COLUMNS.domains.order);
    backfillOrder(store);
    const siblings = readSiblingOrders(store, TABLES.domains, COLUMNS.domains.parentId, parent);
    expect(siblings.map((s) => s.id)).toEqual([a, b, c]);
  });
});
