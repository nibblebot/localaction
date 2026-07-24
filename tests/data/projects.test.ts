import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import {
  createProject,
  updateProject,
} from '../../src/data/projects.ts';
import { deleteProject } from '../../src/data/deletion.ts';
import { createArea } from '../../src/data/areas.ts';
import { COLUMNS, PROJECT_STATUS, TABLES } from '../../src/data/schema.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

describe('projects', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('createProject writes a project scoped to an area', () => {
    const d = createArea(store, { name: 'Family' });
    const p = createProject(store, { name: 'Plan vacation', areaId: d });
    const name = String(store.getCell(TABLES.projects, p, COLUMNS.projects.name));
    const areaId = store.getCell(TABLES.projects, p, COLUMNS.projects.areaId);
    expect(name).toBe('Plan vacation');
    expect(areaId).toBe(d);
  });

  it('updateProject patches name and bumps updatedAt', () => {
    const d = createArea(store, { name: 'Family' });
    const p = createProject(store, { name: 'Plan vacation', areaId: d });
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

  it('updateProject can move the project to a different area', () => {
    const a = createArea(store, { name: 'A' });
    const b = createArea(store, { name: 'B' });
    const p = createProject(store, { name: 'P', areaId: a });
    updateProject(store, p, { areaId: b });
    expect(store.getCell(TABLES.projects, p, COLUMNS.projects.areaId)).toBe(b);
  });

  it('updateProject sets and clears the due date', () => {
    const d = createArea(store, { name: 'Family' });
    const p = createProject(store, { name: 'P', areaId: d });
    expect(store.getCell(TABLES.projects, p, COLUMNS.projects.dueDate)).toBeUndefined();
    updateProject(store, p, { dueDate: '2026-08-14' });
    expect(store.getCell(TABLES.projects, p, COLUMNS.projects.dueDate)).toBe('2026-08-14');
    updateProject(store, p, { dueDate: null });
    expect(store.hasCell(TABLES.projects, p, COLUMNS.projects.dueDate)).toBe(false);
  });

  it('updateProject shelves and restores the backlog status', () => {
    const d = createArea(store, { name: 'Family' });
    const p = createProject(store, { name: 'P', areaId: d });
    // New projects are active by default — stored as an absent cell.
    expect(store.hasCell(TABLES.projects, p, COLUMNS.projects.status)).toBe(false);
    updateProject(store, p, { status: PROJECT_STATUS.backlog });
    expect(store.getCell(TABLES.projects, p, COLUMNS.projects.status)).toBe('backlog');
    updateProject(store, p, { status: PROJECT_STATUS.active });
    expect(store.hasCell(TABLES.projects, p, COLUMNS.projects.status)).toBe(false);
  });

  it('deleteProject removes the row', () => {
    const d = createArea(store, { name: 'Family' });
    const p = createProject(store, { name: 'P', areaId: d });
    deleteProject(store, p);
    expect(store.hasRow(TABLES.projects, p)).toBe(false);
  });
});
