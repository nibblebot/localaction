import { describe, expect, it, beforeEach } from 'bun:test';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES, TASK_STATUS } from '../../src/data/schema.ts';
import { migrateProjectsToTasks } from '../../src/data/migrate.ts';
import { createArea } from '../../src/data/areas.ts';
import { normalizeRelation } from '../../src/data/internal.ts';

/**
 * Legacy fixture rows are written with literal table/cell strings
 * ('projects', 'sections', 'project:<id>', 'section:<id>', …) — the same
 * literals the migration reads. Post-cutover helpers (`createProject`,
 * `createSection`, project/section placements in `createTask`) no longer
 * exist, so this suite must not depend on them.
 */

function freshStore(): MergeableStore {
  return createMergeableStore();
}

function setProject(
  store: MergeableStore,
  id: string,
  fields: {
    name: string;
    areaId?: string;
    dueDate?: string;
    status?: string;
    order: number;
    createdAt: string;
    updatedAt?: string;
  },
): void {
  store.setRow('projects', id, {
    name: fields.name,
    ...(fields.areaId !== undefined ? { areaId: fields.areaId } : {}),
    ...(fields.dueDate !== undefined ? { dueDate: fields.dueDate } : {}),
    ...(fields.status !== undefined ? { status: fields.status } : {}),
    order: fields.order,
    createdAt: fields.createdAt,
    updatedAt: fields.updatedAt ?? fields.createdAt,
  });
}

function setSection(
  store: MergeableStore,
  id: string,
  fields: { name: string; projectId: string; order: number; createdAt: string },
): void {
  store.setRow('sections', id, {
    name: fields.name,
    projectId: fields.projectId,
    order: fields.order,
    createdAt: fields.createdAt,
    updatedAt: fields.createdAt,
  });
}

function setTask(
  store: MergeableStore,
  id: string,
  fields: {
    title: string;
    placement?: string;
    status?: string;
    dueDate?: string;
    order: number;
    createdAt: string;
    updatedAt?: string;
    completedAt?: string;
  },
): void {
  store.setRow(TABLES.tasks, id, {
    title: fields.title,
    ...(fields.placement !== undefined ? { placement: fields.placement } : {}),
    status: fields.status ?? TASK_STATUS.open,
    ...(fields.dueDate !== undefined ? { dueDate: fields.dueDate } : {}),
    order: fields.order,
    createdAt: fields.createdAt,
    updatedAt: fields.updatedAt ?? fields.createdAt,
    ...(fields.completedAt !== undefined ? { completedAt: fields.completedAt } : {}),
  });
}

function setNote(
  store: MergeableStore,
  id: string,
  fields: {
    title: string;
    entityType: string;
    entityId: string;
    body?: string;
    createdAt: string;
  },
): void {
  store.setRow(TABLES.notes, id, {
    slug: id,
    title: fields.title,
    body: fields.body ?? '',
    entityType: fields.entityType,
    entityId: fields.entityId,
    createdAt: fields.createdAt,
    updatedAt: fields.createdAt,
  });
}

function setTombstone(
  store: MergeableStore,
  entityType: string,
  entityId: string,
): void {
  store.setRow('tombstones', `${entityType}:${entityId}`, {
    entityType,
    entityId,
    deletedAt: '2026-08-20T00:00:00.000Z',
  });
}

function rawPlacement(store: MergeableStore, id: string): string | null {
  return normalizeRelation(store.getCell(TABLES.tasks, id, COLUMNS.tasks.placement));
}

function taskOrderCell(store: MergeableStore, id: string): number {
  return Number(store.getCell(TABLES.tasks, id, COLUMNS.tasks.order) ?? 0);
}

function taskStatusCell(store: MergeableStore, id: string): string {
  return String(store.getCell(TABLES.tasks, id, COLUMNS.tasks.status) ?? '');
}

function siblingsOfPlacement(store: MergeableStore, placement: string | null): string[] {
  return store
    .getRowIds(TABLES.tasks)
    .filter((id) => rawPlacement(store, id) === placement)
    .sort((a, b) => taskOrderCell(store, a) - taskOrderCell(store, b));
}

interface Fixture {
  store: MergeableStore;
  areaA: string;
  areaB: string;
  pInbox: string;
  pArea: string;
  pBacklog: string;
  pEmpty: string;
  sLater: string;
  sEarly: string;
  tUnsec1: string;
  tUnsec2: string;
  tSub: string;
  tS1a: string;
  tS1b: string;
  tS2a: string;
  at1: string;
  at2: string;
  bt1: string;
  ibt: string;
  nArea: string;
  nProj: string;
}

/**
 * Build the fixture store:
 * - two areas, an inbox project, an area project with two sections plus
 *   unsectioned tasks (mixed done/open, one nested subtask), a backlog
 *   project, an empty project, pre-existing area + inbox root tasks,
 *   project/area/task notes, and project/section/task tombstones.
 */
function fixtureStore(): Fixture {
  const store = freshStore();
  const areaA = createArea(store, { name: 'Area A' });
  const areaB = createArea(store, { name: 'Area B' });

  // Pre-existing roots in both sibling spaces the projects join.
  const ibt = 'inbox-task-1';
  setTask(store, ibt, {
    title: 'Inbox root',
    order: 700,
    createdAt: '2026-08-10T00:00:00.000Z',
  });
  const at1 = 'area-task-1';
  setTask(store, at1, {
    title: 'Area root first',
    placement: `area:${areaA}`,
    order: 250,
    createdAt: '2026-08-05T00:00:00.000Z',
  });
  const at2 = 'area-task-2';
  setTask(store, at2, {
    title: 'Area root last',
    placement: `area:${areaA}`,
    order: 600,
    createdAt: '2026-08-09T00:00:00.000Z',
  });

  // Inbox project (areaId absent), single open task.
  const pInbox = 'project-inbox';
  setProject(store, pInbox, {
    name: 'Inbox project',
    order: 100,
    createdAt: '2026-08-01T00:00:00.000Z',
  });
  setTask(store, 'pt-inbox-1', {
    title: 'Inbox project task',
    placement: `project:${pInbox}`,
    order: 50,
    createdAt: '2026-08-02T00:00:00.000Z',
  });

  // Area project with two sections + unsectioned tasks.
  const pArea = 'project-area';
  setProject(store, pArea, {
    name: 'Area project',
    areaId: areaA,
    dueDate: '2026-09-15',
    order: 200,
    createdAt: '2026-08-02T00:00:00.000Z',
  });
  const sEarly = 'section-early';
  setSection(store, sEarly, {
    name: 'Early',
    projectId: pArea,
    order: 100,
    createdAt: '2026-08-03T00:00:00.000Z',
  });
  const sLater = 'section-later';
  setSection(store, sLater, {
    name: 'Later',
    projectId: pArea,
    order: 200,
    createdAt: '2026-08-03T00:00:01.000Z',
  });
  const tUnsec1 = 'task-unsec-1';
  setTask(store, tUnsec1, {
    title: 'Unsectioned 1',
    placement: `project:${pArea}`,
    order: 10,
    createdAt: '2026-08-04T00:00:00.000Z',
  });
  const tUnsec2 = 'task-unsec-2';
  setTask(store, tUnsec2, {
    title: 'Unsectioned 2',
    placement: `project:${pArea}`,
    status: 'done',
    order: 20,
    createdAt: '2026-08-04T00:01:00.000Z',
    completedAt: '2026-08-08T00:00:00.000Z',
  });
  const tSub = 'task-unsec-1-sub';
  setTask(store, tSub, {
    title: 'Nested subtask',
    placement: `task:${tUnsec1}`,
    order: 42,
    createdAt: '2026-08-04T00:02:00.000Z',
  });
  const tS1a = 'task-s1-a';
  setTask(store, tS1a, {
    title: 'Section 1 A',
    placement: `section:${sEarly}`,
    order: 5,
    createdAt: '2026-08-05T00:00:00.000Z',
  });
  const tS1b = 'task-s1-b';
  setTask(store, tS1b, {
    title: 'Section 1 B',
    placement: `section:${sEarly}`,
    status: 'done',
    order: 15,
    createdAt: '2026-08-05T00:01:00.000Z',
    completedAt: '2026-08-07T00:00:00.000Z',
  });
  const tS2a = 'task-s2-a';
  setTask(store, tS2a, {
    title: 'Section 2 A',
    placement: `section:${sLater}`,
    order: 7,
    createdAt: '2026-08-06T00:00:00.000Z',
  });

  // Backlog project in the same area.
  const pBacklog = 'project-backlog';
  setProject(store, pBacklog, {
    name: 'Backlog project',
    areaId: areaA,
    status: 'backlog',
    order: 300,
    createdAt: '2026-08-03T00:00:00.000Z',
  });
  const bt1 = 'task-backlog-1';
  setTask(store, bt1, {
    title: 'Backlog task',
    placement: `project:${pBacklog}`,
    order: 25,
    createdAt: '2026-08-06T00:01:00.000Z',
  });

  // Empty project in the same area.
  const pEmpty = 'project-empty';
  setProject(store, pEmpty, {
    name: 'Empty project',
    areaId: areaA,
    order: 400,
    createdAt: '2026-08-04T00:00:00.000Z',
  });

  // Notes: one per entity kind the migration cares about.
  const nArea = 'note-area';
  setNote(store, nArea, {
    title: 'Area note',
    entityType: 'area',
    entityId: areaA,
    createdAt: '2026-08-01T00:00:00.000Z',
  });
  const nProj = 'note-project';
  setNote(store, nProj, {
    title: 'Project note',
    entityType: 'project',
    entityId: pArea,
    createdAt: '2026-08-02T00:00:00.000Z',
  });
  setNote(store, 'note-task', {
    title: 'Task note',
    entityType: 'task',
    entityId: tUnsec1,
    createdAt: '2026-08-03T00:00:00.000Z',
  });

  // Tombstones for a project, a section, and a task.
  setTombstone(store, 'project', pBacklog);
  setTombstone(store, 'section', sLater);
  setTombstone(store, 'task', 'task-already-gone');

  return {
    store,
    areaA,
    areaB,
    pInbox,
    pArea,
    pBacklog,
    pEmpty,
    sLater,
    sEarly,
    tUnsec1,
    tUnsec2,
    tSub,
    tS1a,
    tS1b,
    tS2a,
    at1,
    at2,
    bt1,
    ibt,
    nArea,
    nProj,
  };
}

function allNotes(store: MergeableStore): Array<{ entityType: unknown; entityId: unknown }> {
  return store.getRowIds(TABLES.notes).map((id) => ({
    entityType: store.getCell(TABLES.notes, id, COLUMNS.notes.entityType),
    entityId: store.getCell(TABLES.notes, id, COLUMNS.notes.entityId),
  }));
}

describe('migrateProjectsToTasks', () => {
  let f: Fixture;
  beforeEach(() => {
    f = fixtureStore();
  });

  it('turns each project into a root task that reuses its id', () => {
    migrateProjectsToTasks(f.store);

    expect(f.store.hasRow(TABLES.tasks, f.pInbox)).toBe(true);
    expect(f.store.hasRow(TABLES.tasks, f.pArea)).toBe(true);
    expect(f.store.hasRow(TABLES.tasks, f.pBacklog)).toBe(true);
    expect(f.store.hasRow(TABLES.tasks, f.pEmpty)).toBe(true);

    expect(f.store.getCell(TABLES.tasks, f.pArea, COLUMNS.tasks.title)).toBe('Area project');
    expect(f.store.getCell(TABLES.tasks, f.pArea, COLUMNS.tasks.createdAt)).toBe(
      '2026-08-02T00:00:00.000Z',
    );
    expect(f.store.getCell(TABLES.tasks, f.pArea, COLUMNS.tasks.updatedAt)).toBe(
      '2026-08-02T00:00:00.000Z',
    );
    expect(f.store.getCell(TABLES.tasks, f.pArea, COLUMNS.tasks.dueDate)).toBe('2026-09-15');
  });

  it('writes placements: area:<id> for area projects, absent for the inbox project', () => {
    migrateProjectsToTasks(f.store);

    expect(rawPlacement(f.store, f.pArea)).toBe(`area:${f.areaA}`);
    expect(rawPlacement(f.store, f.pBacklog)).toBe(`area:${f.areaA}`);
    expect(rawPlacement(f.store, f.pEmpty)).toBe(`area:${f.areaA}`);
    expect(rawPlacement(f.store, f.pInbox)).toBeNull();
  });

  it('copies the backlog status onto a backlog cell; others stay absent', () => {
    migrateProjectsToTasks(f.store);

    expect(f.store.getCell(TABLES.tasks, f.pBacklog, COLUMNS.tasks.backlog)).toBe(true);
    expect(f.store.hasCell(TABLES.tasks, f.pArea, COLUMNS.tasks.backlog)).toBe(false);
    expect(f.store.hasCell(TABLES.tasks, f.pInbox, COLUMNS.tasks.backlog)).toBe(false);
  });

  it('stores every new root as open, including the empty-project leaf', () => {
    migrateProjectsToTasks(f.store);

    for (const id of [f.pInbox, f.pArea, f.pBacklog, f.pEmpty]) {
      expect(taskStatusCell(f.store, id)).toBe(TASK_STATUS.open);
    }
    expect(siblingsOfPlacement(f.store, `task:${f.pEmpty}`)).toEqual([]);
  });

  it('flattens children: unsectioned first, then sections by order, in-section order kept', () => {
    migrateProjectsToTasks(f.store);

    expect(siblingsOfPlacement(f.store, `task:${f.pArea}`)).toEqual([
      f.tUnsec1,
      f.tUnsec2,
      f.tS1a,
      f.tS1b,
      f.tS2a,
    ]);
    // The flattened top level is renumbered with 1000-spaced orders.
    const expected = [f.tUnsec1, f.tUnsec2, f.tS1a, f.tS1b, f.tS2a];
    expected.forEach((id, i) => {
      expect(rawPlacement(f.store, id)).toBe(`task:${f.pArea}`);
      expect(taskOrderCell(f.store, id)).toBe((i + 1) * 1000);
    });
    // A single-child project still lands its task as the only child.
    expect(siblingsOfPlacement(f.store, `task:${f.pBacklog}`)).toEqual([f.bt1]);
    expect(taskOrderCell(f.store, f.bt1)).toBe(1000);
  });

  it('keeps nested subtask placement and order untouched', () => {
    migrateProjectsToTasks(f.store);

    expect(rawPlacement(f.store, f.tSub)).toBe(`task:${f.tUnsec1}`);
    expect(taskOrderCell(f.store, f.tSub)).toBe(42);
  });

  it('interleaves ex-project roots with pre-existing area roots by (order, createdAt, id)', () => {
    migrateProjectsToTasks(f.store);

    // pArea (200) < at1 (250) < pBacklog (300) < pEmpty (400) < at2 (600)
    expect(siblingsOfPlacement(f.store, `area:${f.areaA}`)).toEqual([
      f.pArea,
      f.at1,
      f.pBacklog,
      f.pEmpty,
      f.at2,
    ]);
    [f.pArea, f.at1, f.pBacklog, f.pEmpty, f.at2].forEach((id, i) => {
      expect(taskOrderCell(f.store, id)).toBe((i + 1) * 1000);
    });

    // pInbox (100) < ibt (700)
    expect(siblingsOfPlacement(f.store, null)).toEqual([f.pInbox, f.ibt]);
    expect(taskOrderCell(f.store, f.pInbox)).toBe(1000);
    expect(taskOrderCell(f.store, f.ibt)).toBe(2000);
  });

  it('re-attaches project notes to the reused task id as entityType task', () => {
    migrateProjectsToTasks(f.store);

    expect(f.store.getCell(TABLES.notes, f.nProj, COLUMNS.notes.entityType)).toBe('task');
    expect(f.store.getCell(TABLES.notes, f.nProj, COLUMNS.notes.entityId)).toBe(f.pArea);
  });

  it('leaves area and task notes untouched', () => {
    migrateProjectsToTasks(f.store);

    expect(f.store.getCell(TABLES.notes, f.nArea, COLUMNS.notes.entityType)).toBe('area');
    expect(f.store.getCell(TABLES.notes, f.nArea, COLUMNS.notes.entityId)).toBe(f.areaA);
    expect(
      allNotes(f.store).some(
        (n) => n.entityType === 'task' && n.entityId === f.tUnsec1,
      ),
    ).toBe(true);
    expect(allNotes(f.store).some((n) => n.entityType === 'project')).toBe(false);
  });

  it('drops every projects/sections row', () => {
    migrateProjectsToTasks(f.store);

    expect(f.store.getRowIds('projects')).toEqual([]);
    expect(f.store.getRowIds('sections')).toEqual([]);
  });

  it('drops project/section tombstones but keeps task tombstones', () => {
    migrateProjectsToTasks(f.store);

    const rows = f.store
      .getRowIds('tombstones')
      .map((id) => f.store.getCell('tombstones', id, 'entityType'));
    expect(rows).toEqual(['task']);
    expect(f.store.hasRow('tombstones', 'project:project-backlog')).toBe(false);
    expect(f.store.hasRow('tombstones', `section:${f.sLater}`)).toBe(false);
  });

  it('generates a fresh root id when a task already owns the project id', () => {
    // Force the collision: a task row with the same id as the project.
    setTask(f.store, f.pArea, {
      title: 'Pre-existing task',
      order: 999,
      createdAt: '2026-07-30T00:00:00.000Z',
    });
    migrateProjectsToTasks(f.store);

    // The pre-existing task is untouched; the migrated root got a fresh id.
    expect(f.store.getCell(TABLES.tasks, f.pArea, COLUMNS.tasks.title)).toBe(
      'Pre-existing task',
    );
    const migratedRoots = siblingsOfPlacement(f.store, `area:${f.areaA}`).filter(
      (id) => f.store.getCell(TABLES.tasks, id, COLUMNS.tasks.title) === 'Area project',
    );
    expect(migratedRoots).toHaveLength(1);
    const fresh = migratedRoots[0]!;
    expect(fresh).not.toBe(f.pArea);
    expect(rawPlacement(f.store, f.tUnsec1)).toBe(`task:${fresh}`);
    expect(f.store.getCell(TABLES.notes, f.nProj, COLUMNS.notes.entityId)).toBe(fresh);
  });

  it('is a no-op on a store without projects (post-migration / second run)', () => {
    migrateProjectsToTasks(f.store);
    const tablesAfterFirst = f.store.getTables();

    migrateProjectsToTasks(f.store);
    expect(f.store.getTables()).toEqual(tablesAfterFirst);

    const clean = freshStore();
    createArea(clean, { name: 'Nothing' });
    migrateProjectsToTasks(clean);
    expect(clean.getRowIds(TABLES.tasks)).toEqual([]);
  });
});