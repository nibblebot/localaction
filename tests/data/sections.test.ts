import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { createSection, updateSection, getSection, getSectionIdsForProject } from '../../src/data/sections.ts';
import { createProject } from '../../src/data/projects.ts';
import { createArea } from '../../src/data/areas.ts';
import {
  createTask,
  getPlacement,
  getRootPlacement,
  getTasksForProjectDeep,
  decodePlacement,
  encodePlacement,
} from '../../src/data/tasks.ts';
import { moveSection, moveTask } from '../../src/data/order.ts';
import {
  deleteSection,
  deleteProject,
  reconcileTombstones,
} from '../../src/data/deletion.ts';
import { hasTombstone } from '../../src/data/tombstones.ts';
import { TABLES, TOMBSTONE_ENTITY_TYPE } from '../../src/data/schema.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

describe('sections (CRUD + ordering)', () => {
  let store: MergeableStore;
  let projectId: string;
  beforeEach(() => {
    store = freshStore();
    projectId = createProject(store, { name: 'P', areaId: createArea(store, { name: 'A' }) });
  });

  it('creates sections appended in order within their project', () => {
    const s1 = createSection(store, { name: 'One', projectId });
    const s2 = createSection(store, { name: 'Two', projectId });
    expect(getSectionIdsForProject(store, projectId)).toEqual([s1, s2]);
    expect(getSection(store, s1)).toMatchObject({ name: 'One', projectId });
  });

  it('scopes section lists to their own project', () => {
    const other = createProject(store, { name: 'Q', areaId: createArea(store, { name: 'B' }) });
    const s1 = createSection(store, { name: 'One', projectId });
    createSection(store, { name: 'Other', projectId: other });
    expect(getSectionIdsForProject(store, projectId)).toEqual([s1]);
  });

  it('renames a section', () => {
    const s1 = createSection(store, { name: 'One', projectId });
    updateSection(store, s1, { name: 'Renamed' });
    expect(getSection(store, s1)?.name).toBe('Renamed');
  });

  it('moveSection reorders sections within the project', () => {
    const s1 = createSection(store, { name: 'One', projectId });
    const s2 = createSection(store, { name: 'Two', projectId });
    const s3 = createSection(store, { name: 'Three', projectId });
    moveSection(store, s3, s1);
    expect(getSectionIdsForProject(store, projectId)).toEqual([s3, s1, s2]);
    moveSection(store, s3, undefined);
    expect(getSectionIdsForProject(store, projectId)).toEqual([s1, s2, s3]);
  });
});

describe('section task placement (ADR-0001)', () => {
  let store: MergeableStore;
  let projectId: string;
  let sectionId: string;
  beforeEach(() => {
    store = freshStore();
    projectId = createProject(store, { name: 'P', areaId: createArea(store, { name: 'A' }) });
    sectionId = createSection(store, { name: 'S', projectId });
  });

  it('round-trips the section placement encoding', () => {
    const p = { kind: 'section', id: sectionId } as const;
    expect(encodePlacement(p)).toBe(`section:${sectionId}`);
    expect(decodePlacement(`section:${sectionId}`)).toEqual(p);
  });

  it('resolves a section-rooted task’s ownership to the owning project', () => {
    const t = createTask(store, { title: 'T', placement: { kind: 'section', id: sectionId } });
    expect(getPlacement(store, t)).toEqual({ kind: 'section', id: sectionId });
    expect(getRootPlacement(store, t)).toEqual({ kind: 'project', id: projectId });
    // Sub-tasks of a section task resolve through their ancestry.
    const sub = createTask(store, { title: 'Sub', placement: { kind: 'task', id: t } });
    expect(getRootPlacement(store, sub)).toEqual({ kind: 'project', id: projectId });
  });

  it('resolves a task under a missing section to the Inbox', () => {
    const t = createTask(store, { title: 'T', placement: { kind: 'section', id: sectionId } });
    store.delRow(TABLES.sections, sectionId);
    expect(getRootPlacement(store, t)).toEqual({ kind: 'inbox' });
  });

  it('includes section tasks in the deep project task list', () => {
    const unsectioned = createTask(store, { title: 'U', placement: { kind: 'project', id: projectId } });
    const inSection = createTask(store, { title: 'S', placement: { kind: 'section', id: sectionId } });
    const sub = createTask(store, { title: 'Sub', placement: { kind: 'task', id: inSection } });
    const deep = getTasksForProjectDeep(store, projectId);
    expect(deep).toContain(unsectioned);
    expect(deep).toContain(inSection);
    expect(deep).toContain(sub);
  });

  it('moves a task into a section and back out', () => {
    const t = createTask(store, { title: 'T', placement: { kind: 'project', id: projectId } });
    moveTask(store, t, `section:${sectionId}`, undefined);
    expect(getPlacement(store, t)).toEqual({ kind: 'section', id: sectionId });
    moveTask(store, t, `project:${projectId}`, undefined);
    expect(getPlacement(store, t)).toEqual({ kind: 'project', id: projectId });
  });

  it('refuses to move a task into a missing section', () => {
    const t = createTask(store, { title: 'T', placement: { kind: 'project', id: projectId } });
    moveTask(store, t, 'section:missing', undefined);
    expect(getPlacement(store, t)).toEqual({ kind: 'project', id: projectId });
  });
});

describe('section deletion (containment cascade)', () => {
  let store: MergeableStore;
  let projectId: string;
  let sectionId: string;
  beforeEach(() => {
    store = freshStore();
    projectId = createProject(store, { name: 'P', areaId: createArea(store, { name: 'A' }) });
    sectionId = createSection(store, { name: 'S', projectId });
  });

  it('deletes a section with its tasks and writes a tombstone', () => {
    const t = createTask(store, { title: 'T', placement: { kind: 'section', id: sectionId } });
    const sub = createTask(store, { title: 'Sub', placement: { kind: 'task', id: t } });
    const keep = createTask(store, { title: 'Keep', placement: { kind: 'project', id: projectId } });
    deleteSection(store, sectionId);
    expect(store.hasRow(TABLES.sections, sectionId)).toBe(false);
    expect(store.hasRow(TABLES.tasks, t)).toBe(false);
    expect(store.hasRow(TABLES.tasks, sub)).toBe(false);
    expect(store.hasRow(TABLES.tasks, keep)).toBe(true);
    expect(hasTombstone(store, TOMBSTONE_ENTITY_TYPE.section, sectionId)).toBe(true);
  });

  it('sweeps a late-arriving task under a tombstoned section', () => {
    deleteSection(store, sectionId);
    const late = createTask(store, { title: 'late', placement: { kind: 'section', id: sectionId } });
    expect(store.hasRow(TABLES.tasks, late)).toBe(true);
    expect(reconcileTombstones(store)).toBe(true);
    expect(store.hasRow(TABLES.tasks, late)).toBe(false);
  });

  it('deleting a project cascades its sections and their tasks', () => {
    const t = createTask(store, { title: 'T', placement: { kind: 'section', id: sectionId } });
    deleteProject(store, projectId);
    expect(store.hasRow(TABLES.projects, projectId)).toBe(false);
    expect(store.hasRow(TABLES.sections, sectionId)).toBe(false);
    expect(store.hasRow(TABLES.tasks, t)).toBe(false);
  });
});
