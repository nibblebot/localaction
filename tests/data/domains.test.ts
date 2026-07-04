import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
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

  it('writes a domain with the given name and no parent', () => {
    const id = createDomain(store, { name: 'Family' });
    const d = getDomain(store, id);
    expect(d?.name).toBe('Family');
    expect(d?.parentId).toBeNull();
    expect(typeof d?.createdAt).toBe('string');
    expect(d?.updatedAt).toBe(d?.createdAt);
  });

  it('records the parentId for a sub-Domain', () => {
    const parent = createDomain(store, { name: 'Family' });
    const child = createDomain(store, { name: 'Wife', parentId: parent });
    expect(getDomain(store, child)?.parentId).toBe(parent);
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
    const before = getDomain(store, id)?.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    updateDomain(store, id, { name: 'Family Life' });
    const after = getDomain(store, id);
    expect(after?.name).toBe('Family Life');
    expect(after?.updatedAt).not.toBe(before);
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

describe('getDomain / getDomainPath', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
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
    const path = getDomainPath(store, child);
    expect(path.map((d) => d.name)).toEqual(['Wife']);
  });

  it('getDomainPath returns [] for a missing id', () => {
    expect(getDomainPath(store, 'nope')).toEqual([]);
  });
});
