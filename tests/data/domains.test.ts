import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES } from '../../src/data/schema.ts';
import {
  createDomain,
  updateDomain,
  deleteDomain,
  getDomain,
} from '../../src/data/domains.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

describe('createDomain', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('writes a domain with the given name, default color, and no parent', () => {
    const id = createDomain(store, { name: 'Family' });
    const name = String(store.getCell(TABLES.domains, id, COLUMNS.domains.name));
    const parentId = store.getCell(TABLES.domains, id, COLUMNS.domains.parentId);
    const color = String(store.getCell(TABLES.domains, id, COLUMNS.domains.color));
    expect(name).toBe('Family');
    expect(parentId).toBeUndefined();
    expect(color).toBe('gray');
  });

  it('persists a chosen color', () => {
    const id = createDomain(store, { name: 'Work', color: 'purple' });
    const color = String(store.getCell(TABLES.domains, id, COLUMNS.domains.color));
    expect(color).toBe('purple');
  });

  it('records the parentId for a sub-Domain', () => {
    const a = createDomain(store, { name: 'A' });
    const child = createDomain(store, { name: 'C', parentId: a });
    expect(getDomain(store, child)?.parentId).toBe(a);
  });

  it('returns distinct ids for each call', () => {
    const a = createDomain(store, { name: 'A' });
    const b = createDomain(store, { name: 'B' });
    expect(a).not.toBe(b);
  });
});

describe('updateDomain', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('patches name and bumps updatedAt', () => {
    const id = createDomain(store, { name: 'Family' });
    store.setCell(TABLES.domains, id, COLUMNS.domains.updatedAt, '2000-01-01T00:00:00Z');
    updateDomain(store, id, { name: 'Family Life' });
    const after = getDomain(store, id);
    expect(after?.name).toBe('Family Life');
    expect(after?.updatedAt).not.toBe('2000-01-01T00:00:00Z');
  });

  it('reparents a sub-Domain by changing parentId', () => {
    const a = createDomain(store, { name: 'A' });
    const b = createDomain(store, { name: 'B' });
    const child = createDomain(store, { name: 'C', parentId: a });
    updateDomain(store, child, { parentId: b });
    expect(getDomain(store, child)?.parentId).toBe(b);
  });

  it('can detach to a top-level domain by setting parentId null', () => {
    const a = createDomain(store, { name: 'A' });
    const child = createDomain(store, { name: 'C', parentId: a });
    updateDomain(store, child, { parentId: null });
    expect(getDomain(store, child)?.parentId).toBeNull();
  });

  it('patches the color', () => {
    const id = createDomain(store, { name: 'Work' });
    updateDomain(store, id, { color: 'blue' });
    expect(getDomain(store, id)?.color).toBe('blue');
  });
});

describe('deleteDomain', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('removes the row', () => {
    const id = createDomain(store, { name: 'Family' });
    deleteDomain(store, id);
    expect(getDomain(store, id)).toBeUndefined();
  });

  it('does NOT cascade-delete children (orphan policy)', () => {
    const parent = createDomain(store, { name: 'Family' });
    const child = createDomain(store, { name: 'Wife', parentId: parent });
    deleteDomain(store, parent);
    expect(getDomain(store, child)).toMatchObject({ parentId: parent });
  });
});

describe('getDomain', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('returns undefined for a missing id', () => {
    expect(getDomain(store, 'nope')).toBeUndefined();
  });

  it('returns a normalised entity', () => {
    const id = createDomain(store, { name: 'Family', color: 'green' });
    const domain = getDomain(store, id);
    expect(domain).toMatchObject({ id, name: 'Family', color: 'green' });
  });
});
