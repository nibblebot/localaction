import { describe, expect, it, beforeEach } from 'bun:test';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { TABLES, TASK_STATUS } from '../../src/data/schema.ts';
import { createTask, updateTask, setTaskStatus } from '../../src/data/tasks.ts';
import { createProject, updateProject } from '../../src/data/projects.ts';
import { createArea } from '../../src/data/areas.ts';
import { createSection } from '../../src/data/sections.ts';
import { getDueItems } from '../../src/data/selectors.ts';

const TODAY = '2026-07-23';
const TOMORROW = '2026-07-24';
const YESTERDAY = '2026-07-22';
const WEEK_FROM = '2026-07-20';
const WEEK_TO = '2026-07-26';
const NEXT_WEEK = '2026-07-27';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

describe('getDueItems', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('returns nothing when no due dates are set', () => {
    createTask(store, { title: 'No date' });
    expect(getDueItems(store, TODAY, TODAY)).toEqual([]);
  });

  it('includes inbox tasks due today and excludes other days when range is single-day', () => {
    const dueToday = createTask(store, { title: 'Today' });
    updateTask(store, dueToday, { dueDate: TODAY });
    const tomorrow = createTask(store, { title: 'Tomorrow' });
    updateTask(store, tomorrow, { dueDate: TOMORROW });
    const yesterday = createTask(store, { title: 'Yesterday' });
    updateTask(store, yesterday, { dueDate: YESTERDAY });
    const items = getDueItems(store, TODAY, TODAY);
    expect(items.map((i) => i.id)).toEqual([dueToday]);
    expect(items[0]).toMatchObject({
      kind: 'task',
      areaId: null,
      projectId: null,
      done: false,
      dueDate: TODAY,
    });
  });

  it('includes days within a range and excludes days outside it', () => {
    const mon = createTask(store, { title: 'Mon' });
    updateTask(store, mon, { dueDate: '2026-07-20' });
    const wed = createTask(store, { title: 'Wed' });
    updateTask(store, wed, { dueDate: '2026-07-22' });
    const sun = createTask(store, { title: 'Sun' });
    updateTask(store, sun, { dueDate: WEEK_TO });
    const beforeWeek = createTask(store, { title: 'Last Sunday' });
    updateTask(store, beforeWeek, { dueDate: '2026-07-19' });
    const afterWeek = createTask(store, { title: 'Next Monday' });
    updateTask(store, afterWeek, { dueDate: NEXT_WEEK });
    const items = getDueItems(store, WEEK_FROM, WEEK_TO);
    expect(items.map((i) => i.id)).toEqual([mon, wed, sun]);
    expect(items.map((i) => i.dueDate)).toEqual(['2026-07-20', '2026-07-22', WEEK_TO]);
  });

  it('resolves area-rooted tasks to their area', () => {
    const areaId = createArea(store, { name: 'Work' });
    const tid = createTask(store, { title: 'Area task', placement: { kind: 'area', id: areaId } });
    updateTask(store, tid, { dueDate: TODAY });
    expect(getDueItems(store, TODAY, TODAY)).toEqual([
      { kind: 'task', id: tid, dueDate: TODAY, areaId, projectId: null, done: false },
    ]);
  });

  it('resolves project tasks to their project and the project’s area', () => {
    const areaId = createArea(store, { name: 'Work' });
    const projectId = createProject(store, { name: 'Launch', areaId });
    const tid = createTask(store, {
      title: 'Project task',
      placement: { kind: 'project', id: projectId },
    });
    updateTask(store, tid, { dueDate: TODAY });
    expect(getDueItems(store, TODAY, TODAY)).toEqual([
      { kind: 'task', id: tid, dueDate: TODAY, areaId, projectId, done: false },
    ]);
  });

  it('resolves section-rooted tasks through the section’s project', () => {
    const areaId = createArea(store, { name: 'Work' });
    const projectId = createProject(store, { name: 'Launch', areaId });
    const sectionId = createSection(store, { name: 'Phase 1', projectId });
    const tid = createTask(store, {
      title: 'Section task',
      placement: { kind: 'section', id: sectionId },
    });
    updateTask(store, tid, { dueDate: TODAY });
    expect(getDueItems(store, TODAY, TODAY)).toEqual([
      { kind: 'task', id: tid, dueDate: TODAY, areaId, projectId, done: false },
    ]);
  });

  it('surfaces nested sub-tasks due today under their root project', () => {
    const areaId = createArea(store, { name: 'Work' });
    const projectId = createProject(store, { name: 'Launch', areaId });
    const parent = createTask(store, {
      title: 'Parent',
      placement: { kind: 'project', id: projectId },
    });
    const child = createTask(store, {
      title: 'Child due today',
      placement: { kind: 'task', id: parent },
    });
    updateTask(store, child, { dueDate: TODAY });
    expect(getDueItems(store, TODAY, TODAY)).toEqual([
      { kind: 'task', id: child, dueDate: TODAY, areaId, projectId, done: false },
    ]);
  });

  it('includes projects due today even with no due tasks', () => {
    const areaId = createArea(store, { name: 'Work' });
    const projectId = createProject(store, { name: 'Launch', areaId });
    updateProject(store, projectId, { dueDate: TODAY });
    expect(getDueItems(store, TODAY, TODAY)).toEqual([
      { kind: 'project', id: projectId, dueDate: TODAY, areaId, projectId, done: false },
    ]);
  });

  it('marks effectively-done tasks as done', () => {
    const tid = createTask(store, { title: 'Done today' });
    updateTask(store, tid, { dueDate: TODAY });
    setTaskStatus(store, tid, TASK_STATUS.done);
    expect(getDueItems(store, TODAY, TODAY)).toEqual([
      { kind: 'task', id: tid, dueDate: TODAY, areaId: null, projectId: null, done: true },
    ]);
  });

  it('treats a stored-done parent with an open child as open', () => {
    const parent = createTask(store, { title: 'Parent' });
    updateTask(store, parent, { dueDate: TODAY });
    createTask(store, { title: 'Open child', placement: { kind: 'task', id: parent } });
    setTaskStatus(store, parent, TASK_STATUS.done);
    expect(getDueItems(store, TODAY, TODAY)).toEqual([
      { kind: 'task', id: parent, dueDate: TODAY, areaId: null, projectId: null, done: false },
    ]);
  });

  it('orphaned sub-tasks fall back to the Inbox group', () => {
    const parent = createTask(store, { title: 'Parent' });
    const child = createTask(store, {
      title: 'Orphan',
      placement: { kind: 'task', id: parent },
    });
    updateTask(store, child, { dueDate: TODAY });
    store.delRow(TABLES.tasks, parent);
    expect(getDueItems(store, TODAY, TODAY)).toEqual([
      { kind: 'task', id: child, dueDate: TODAY, areaId: null, projectId: null, done: false },
    ]);
  });

  it('range bounds are inclusive on both ends', () => {
    const fromDate = '2026-07-20';
    const toDate = '2026-07-26';
    const a = createTask(store, { title: 'A' });
    updateTask(store, a, { dueDate: '2026-07-20' });
    const b = createTask(store, { title: 'B' });
    updateTask(store, b, { dueDate: '2026-07-26' });
    const ids = getDueItems(store, fromDate, toDate).map((i) => i.id);
    expect(ids).toContain(a);
    expect(ids).toContain(b);
  });
});
