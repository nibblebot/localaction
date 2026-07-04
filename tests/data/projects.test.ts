import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES } from '../../src/data/schema.ts';
import {
  createProject,
  updateProject,
  deleteProject,
  getProject,
  getProjectsForDomain,
  getOrphanedProjectIds,
} from '../../src/data/projects.ts';
import { createDomain, deleteDomain } from '../../src/data/domains.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

describe('projects', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('createProject writes a row scoped to a domain', () => {
    const d = createDomain(store, { name: 'Family' });
    const p = createProject(store, { name: 'Plan vacation', domainId: d });
    expect(store.getCell(TABLES.projects, p, COLUMNS.projects.name)).toBe('Plan vacation');
    expect(store.getCell(TABLES.projects, p, COLUMNS.projects.domainId)).toBe(d);
    expect(typeof store.getCell(TABLES.projects, p, COLUMNS.projects.createdAt)).toBe('string');
  });

  it('updateProject patches name and bumps updatedAt', async () => {
    const d = createDomain(store, { name: 'Family' });
    const p = createProject(store, { name: 'Plan vacation', domainId: d });
    const before = store.getCell(TABLES.projects, p, COLUMNS.projects.updatedAt);
    await new Promise((r) => setTimeout(r, 5));
    updateProject(store, p, { name: 'Plan vacation 2026' });
    expect(store.getCell(TABLES.projects, p, COLUMNS.projects.name)).toBe('Plan vacation 2026');
    expect(store.getCell(TABLES.projects, p, COLUMNS.projects.updatedAt)).not.toBe(before);
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

  it('getProject returns a normalised entity', () => {
    const d = createDomain(store, { name: 'Family' });
    const p = createProject(store, { name: 'P', domainId: d });
    const project = getProject(store, p);
    expect(project).toMatchObject({ id: p, name: 'P', domainId: d });
    expect(getProject(store, 'nope')).toBeUndefined();
  });

  it('getProjectsForDomain lists projects scoped to that domain', () => {
    const a = createDomain(store, { name: 'A' });
    const b = createDomain(store, { name: 'B' });
    const pa = createProject(store, { name: 'PA1', domainId: a });
    const pa2 = createProject(store, { name: 'PA2', domainId: a });
    createProject(store, { name: 'PB1', domainId: b });
    expect(getProjectsForDomain(store, a).sort()).toEqual([pa, pa2].sort());
    expect(getProjectsForDomain(store, b)).toHaveLength(1);
  });

  it('orphan detection flags projects whose domain is gone', () => {
    const d = createDomain(store, { name: 'A' });
    const p = createProject(store, { name: 'P', domainId: d });
    deleteDomain(store, d);
    expect(getOrphanedProjectIds(store)).toContain(p);
  });
});