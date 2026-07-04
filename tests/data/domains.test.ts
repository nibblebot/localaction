import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES } from '../../src/data/schema.ts';
import {
  createDomain,
  updateDomain,
  deleteDomain,
  getDomain,
  getDomainPath,
} from '../../src/data/domains.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

describe('createDomain', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('writes a row with name, empty parentId, and timestamps', () => {
    const id = createDomain(store, { name: 'Family' });
    expect(store.getCell(TABLES.domains, id, COLUMNS.domains.name)).toBe('Family');
    expect(store.getCell(TABLES.domains, id, COLUMNS.domains.parentId)).toBeUndefined();
    const createdAt = store.getCell(TABLES.domains, id, COLUMNS.domains.createdAt);
    const updatedAt = store.getCell(TABLES.domains, id, COLUMNS.domains.updatedAt);
    expect(typeof createdAt).toBe('string');
    expect(updatedAt).toBe(createdAt);
  });

  it('records the parentId for a sub-Domain', () => {
    const parent = createDomain(store, { name: 'Family' });
    const child = createDomain(store, { name: 'Wife', parentId: parent });
    expect(store.getCell(TABLES.domains, child, COLUMNS.domains.parentId)).toBe(parent);
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

  it('patches name and bumps updatedAt', async () => {
    const id = createDomain(store, { name: 'Family' });
    const before = store.getCell(TABLES.domains, id, COLUMNS.domains.updatedAt);
    await new Promise((r) => setTimeout(r, 5));
    updateDomain(store, id, { name: 'Family Life' });
    expect(store.getCell(TABLES.domains, id, COLUMNS.domains.name)).toBe('Family Life');
    const after = store.getCell(TABLES.domains, id, COLUMNS.domains.updatedAt);
    expect(typeof after).toBe('string');
    expect(after).not.toBe(before);
  });

  it('reparents a sub-Domain by changing parentId', () => {
    const a = createDomain(store, { name: 'A' });
    const b = createDomain(store, { name: 'B' });
    const child = createDomain(store, { name: 'C', parentId: a });
    updateDomain(store, child, { parentId: b });
    expect(store.getCell(TABLES.domains, child, COLUMNS.domains.parentId)).toBe(b);
  });

  it('can detach to a top-level domain by setting parentId null', () => {
    const a = createDomain(store, { name: 'A' });
    const child = createDomain(store, { name: 'C', parentId: a });
    updateDomain(store, child, { parentId: null });
    expect(store.getCell(TABLES.domains, child, COLUMNS.domains.parentId)).toBeUndefined();
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
    expect(store.hasRow(TABLES.domains, id)).toBe(false);
  });

  it('does NOT cascade-delete children (orphan policy)', () => {
    const parent = createDomain(store, { name: 'Family' });
    const child = createDomain(store, { name: 'Wife', parentId: parent });
    deleteDomain(store, parent);
    expect(store.hasRow(TABLES.domains, child)).toBe(true);
    // The stale parentId is preserved so the UI can detect the orphan.
    expect(store.getCell(TABLES.domains, child, COLUMNS.domains.parentId)).toBe(parent);
    expect(getDomain(store, child)?.parentId).toBe(parent);
  });
});

describe('getDomain / getDomainPath', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('getDomain returns a normalised entity (parentId null when unset)', () => {
    const id = createDomain(store, { name: 'Family' });
    const domain = getDomain(store, id);
    expect(domain).toMatchObject({ id, name: 'Family', parentId: null });
    expect(domain!.createdAt).toBeTypeOf('string');
  });

  it('getDomain returns undefined for a missing id', () => {
    expect(getDomain(store, 'nope')).toBeUndefined();
  });

  it('getDomainPath walks parent chain root-first and includes the target', () => {
    const root = createDomain(store, { name: 'Family' });
    const mid = createDomain(store, { name: 'Wife', parentId: root });
    const leaf = createDomain(store, { name: 'Wedding', parentId: mid });
    const path = getDomainPath(store, leaf);
    expect(path.map((d) => d.name)).toEqual(['Family', 'Wife', 'Wedding']);
  });

  it('getDomainPath truncates at a missing parent — orphan resolves to itself', () => {
    const root = createDomain(store, { name: 'Family' });
    const child = createDomain(store, { name: 'Wife', parentId: root });
    deleteDomain(store, root);
    // The parent is gone, so the walk can only resolve the target itself.
    const path = getDomainPath(store, child);
    expect(path.map((d) => d.name)).toEqual(['Wife']);
  });

  it('getDomainPath returns [] for a missing id', () => {
    expect(getDomainPath(store, 'nope')).toEqual([]);
  });
});