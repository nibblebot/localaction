import { describe, expect, it, beforeEach } from 'bun:test';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES } from '../../src/data/schema.ts';
import {
  createArea,
  updateArea,
  getArea,
} from '../../src/data/areas.ts';
import { deleteArea } from '../../src/data/deletion.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

describe('createArea', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('writes an area with the given name, default color, and no parent', () => {
    const id = createArea(store, { name: 'Family' });
    const name = String(store.getCell(TABLES.areas, id, COLUMNS.areas.name));
    const parentId = store.getCell(TABLES.areas, id, COLUMNS.areas.parentId);
    const color = String(store.getCell(TABLES.areas, id, COLUMNS.areas.color));
    expect(name).toBe('Family');
    expect(parentId).toBeUndefined();
    expect(color).toBe('gray');
  });

  it('persists a chosen color', () => {
    const id = createArea(store, { name: 'Work', color: 'purple' });
    const color = String(store.getCell(TABLES.areas, id, COLUMNS.areas.color));
    expect(color).toBe('purple');
  });

  it('records the parentId for a sub-Area', () => {
    const a = createArea(store, { name: 'A' });
    const child = createArea(store, { name: 'C', parentId: a });
    expect(getArea(store, child)?.parentId).toBe(a);
  });

  it('returns distinct ids for each call', () => {
    const a = createArea(store, { name: 'A' });
    const b = createArea(store, { name: 'B' });
    expect(a).not.toBe(b);
  });
});

describe('updateArea', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('patches name and bumps updatedAt', () => {
    const id = createArea(store, { name: 'Family' });
    store.setCell(TABLES.areas, id, COLUMNS.areas.updatedAt, '2000-01-01T00:00:00Z');
    updateArea(store, id, { name: 'Family Life' });
    const after = getArea(store, id);
    expect(after?.name).toBe('Family Life');
    expect(after?.updatedAt).not.toBe('2000-01-01T00:00:00Z');
  });

  it('reparents a sub-Area by changing parentId', () => {
    const a = createArea(store, { name: 'A' });
    const b = createArea(store, { name: 'B' });
    const child = createArea(store, { name: 'C', parentId: a });
    updateArea(store, child, { parentId: b });
    expect(getArea(store, child)?.parentId).toBe(b);
  });

  it('can detach to a top-level area by setting parentId null', () => {
    const a = createArea(store, { name: 'A' });
    const child = createArea(store, { name: 'C', parentId: a });
    updateArea(store, child, { parentId: null });
    expect(getArea(store, child)?.parentId).toBeNull();
  });

  it('patches the color', () => {
    const id = createArea(store, { name: 'Work' });
    updateArea(store, id, { color: 'blue' });
    expect(getArea(store, id)?.color).toBe('blue');
  });
});

describe('deleteArea', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('removes the row', () => {
    const id = createArea(store, { name: 'Family' });
    deleteArea(store, id);
    expect(getArea(store, id)).toBeUndefined();
  });

  it('cascades deletion through the sub-area subtree (ADR-0001)', () => {
    const parent = createArea(store, { name: 'Family' });
    const child = createArea(store, { name: 'Wife', parentId: parent });
    deleteArea(store, parent);
    expect(getArea(store, child)).toBeUndefined();
  });
});

describe('getArea', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('returns undefined for a missing id', () => {
    expect(getArea(store, 'nope')).toBeUndefined();
  });

  it('returns a normalised entity', () => {
    const id = createArea(store, { name: 'Family', color: 'green' });
    const area = getArea(store, id);
    expect(area).toMatchObject({ id, name: 'Family', color: 'green' });
  });
});
