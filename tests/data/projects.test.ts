import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import {
  createProject,
  updateProject,
  deleteProject,
} from '../../src/data/projects.ts';
import { createDomain } from '../../src/data/domains.ts';
import { COLUMNS, TABLES } from '../../src/data/schema.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

describe('projects', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('createProject writes a project scoped to a domain', () => {
    const d = createDomain(store, { name: 'Family' });
    const p = createProject(store, { name: 'Plan vacation', domainId: d });
    const name = String(store.getCell(TABLES.projects, p, COLUMNS.projects.name));
    const domainId = store.getCell(TABLES.projects, p, COLUMNS.projects.domainId);
    expect(name).toBe('Plan vacation');
    expect(domainId).toBe(d);
  });

  it('updateProject patches name and bumps updatedAt', () => {
    const d = createDomain(store, { name: 'Family' });
    const p = createProject(store, { name: 'Plan vacation', domainId: d });
    // Override the updatedAt cell to a sentinel so we can detect the bump
    // without depending on wall-clock time.
    store.setCell(TABLES.projects, p, COLUMNS.projects.updatedAt, '1999-01-01T00:00:00Z');
    const before = String(store.getCell(TABLES.projects, p, COLUMNS.projects.updatedAt));
    updateProject(store, p, { name: 'Plan vacation 2026' });
    const after = String(store.getCell(TABLES.projects, p, COLUMNS.projects.updatedAt));
    const name = String(store.getCell(TABLES.projects, p, COLUMNS.projects.name));
    expect(name).toBe('Plan vacation 2026');
    expect(after).not.toBe(before);
  });

  it('updateProject can move the project to a different domain', () => {
    const a = createDomain(store, { name: 'A' });
    const b = createDomain(store, { name: 'B' });
    const p = createProject(store, { name: 'P', domainId: a });
    updateProject(store, p, { domainId: b });
    expect(store.getCell(TABLES.projects, p, COLUMNS.projects.domainId)).toBe(b);
  });

  it('deleteProject removes the row', () => {
    const d = createDomain(store, { name: 'Family' });
    const p = createProject(store, { name: 'P', domainId: d });
    deleteProject(store, p);
    expect(store.hasRow(TABLES.projects, p)).toBe(false);
  });
});
