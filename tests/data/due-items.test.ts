import { describe, expect, it, beforeEach } from 'bun:test';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { TABLES, COLUMNS, TASK_STATUS } from '../../src/data/schema.ts';
import { createTask, updateTask, setTaskStatus } from '../../src/data/tasks.ts';
import { createArea } from '../../src/data/areas.ts';
import { getDueItems, getCompletedItemsInRange } from '../../src/data/selectors.ts';

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
      rootTaskId: dueToday,
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

  it('resolves area-rooted tasks to their area and carries the root task id', () => {
    const areaId = createArea(store, { name: 'Work' });
    const tid = createTask(store, { title: 'Area task', placement: { kind: 'area', id: areaId } });
    updateTask(store, tid, { dueDate: TODAY });
    expect(getDueItems(store, TODAY, TODAY)).toEqual([
      { kind: 'task', id: tid, dueDate: TODAY, areaId, rootTaskId: tid, done: false },
    ]);
  });

  it('surfaces nested sub-tasks due today under their root task', () => {
    const areaId = createArea(store, { name: 'Work' });
    const parent = createTask(store, {
      title: 'Parent',
      placement: { kind: 'area', id: areaId },
    });
    const child = createTask(store, {
      title: 'Child due today',
      placement: { kind: 'task', id: parent },
    });
    updateTask(store, child, { dueDate: TODAY });
    expect(getDueItems(store, TODAY, TODAY)).toEqual([
      { kind: 'task', id: child, dueDate: TODAY, areaId, rootTaskId: parent, done: false },
    ]);
  });

  it('marks derived-done tasks as done', () => {
    const tid = createTask(store, { title: 'Done today' });
    updateTask(store, tid, { dueDate: TODAY });
    setTaskStatus(store, tid, TASK_STATUS.done);
    expect(getDueItems(store, TODAY, TODAY)).toEqual([
      { kind: 'task', id: tid, dueDate: TODAY, areaId: null, rootTaskId: tid, done: true },
    ]);
  });

  it('treats a stored-done parent with an open child as open', () => {
    const parent = createTask(store, { title: 'Parent' });
    updateTask(store, parent, { dueDate: TODAY });
    createTask(store, { title: 'Open child', placement: { kind: 'task', id: parent } });
    setTaskStatus(store, parent, TASK_STATUS.done);
    expect(getDueItems(store, TODAY, TODAY)).toEqual([
      { kind: 'task', id: parent, dueDate: TODAY, areaId: null, rootTaskId: parent, done: false },
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
      { kind: 'task', id: child, dueDate: TODAY, areaId: null, rootTaskId: child, done: false },
    ]);
  });

  // Local noon stamp: `localDayOf` resolves to the calendar day in any
  // timezone, so the window filter below is tz-deterministic.
  const atNoon = (y: number, m: number, d: number): string =>
    new Date(y, m - 1, d, 12, 0, 0).toISOString();

  it('getCompletedItemsInRange returns rows for stamped, done tasks completed in [from, to]', () => {
    const a = createTask(store, { title: 'A' });
    setTaskStatus(store, a, TASK_STATUS.done);
    store.setCell(TABLES.tasks, a, COLUMNS.tasks.completedAt, atNoon(2026, 7, 23));
    const b = createTask(store, { title: 'B' });
    setTaskStatus(store, b, TASK_STATUS.done);
    store.setCell(TABLES.tasks, b, COLUMNS.tasks.completedAt, atNoon(2026, 7, 25));

    const items = getCompletedItemsInRange(store, '2026-07-23', '2026-07-26');
    const ids = items.map((i) => i.taskId);
    expect(ids).toContain(a);
    expect(ids).toContain(b);
    expect(items.map((i) => i.localDay)).toEqual(['2026-07-23', '2026-07-25']);
  });

  it('getCompletedItemsInRange excludes tasks with no completedAt cell (pre-migration rows)', () => {
    const t = createTask(store, { title: 'legacy' });
    // Manually stamp a blank cell — the row is stored-done but the
    // completedAt cell is empty. The selector must drop it.
    setTaskStatus(store, t, TASK_STATUS.done);
    store.delCell(TABLES.tasks, t, COLUMNS.tasks.completedAt);
    expect(getCompletedItemsInRange(store, '2026-07-23', '2026-07-23')).toEqual([]);
  });

  it('getCompletedItemsInRange includes tasks regardless of dueDate when completed in the window', () => {
    // No due date at all — still surfaces.
    const noDue = createTask(store, { title: 'no due date' });
    setTaskStatus(store, noDue, TASK_STATUS.done);
    store.setCell(TABLES.tasks, noDue, COLUMNS.tasks.completedAt, atNoon(2026, 7, 24));
    // Due far outside the window — still surfaces.
    const futureDue = createTask(store, { title: 'future due' });
    updateTask(store, futureDue, { dueDate: '2026-08-15' });
    setTaskStatus(store, futureDue, TASK_STATUS.done);
    store.setCell(TABLES.tasks, futureDue, COLUMNS.tasks.completedAt, atNoon(2026, 7, 23));
    // Due before the window — still surfaces.
    const pastDue = createTask(store, { title: 'past due' });
    updateTask(store, pastDue, { dueDate: '2026-07-01' });
    setTaskStatus(store, pastDue, TASK_STATUS.done);
    store.setCell(TABLES.tasks, pastDue, COLUMNS.tasks.completedAt, atNoon(2026, 7, 25));
    // Due INSIDE the window but completed outside it — excluded. The
    // completion day is the only gate.
    const outside = createTask(store, { title: 'outside' });
    updateTask(store, outside, { dueDate: '2026-07-23' });
    setTaskStatus(store, outside, TASK_STATUS.done);
    store.setCell(TABLES.tasks, outside, COLUMNS.tasks.completedAt, atNoon(2026, 7, 27));

    const ids = getCompletedItemsInRange(store, '2026-07-22', '2026-07-26').map(
      (i) => i.taskId,
    );
    expect(ids).toEqual(expect.arrayContaining([noDue, futureDue, pastDue]));
    expect(ids).not.toContain(outside);
  });

  it('getCompletedItemsInRange returns [] for an empty store', () => {
    expect(getCompletedItemsInRange(store, '2026-07-23', '2026-07-23')).toEqual([]);
  });

  it('getCompletedItemsInRange sorts ascending by localDay, then completedAt', () => {
    // Three completed tasks, two on the same local day, one a day later.
    // The selector must sort localDay first, then completedAt within
    // the same local day. Local-time stamps keep both the day and the
    // within-day order deterministic in any timezone.
    const t1 = createTask(store, { title: 'T1' });
    setTaskStatus(store, t1, TASK_STATUS.done);
    store.setCell(
      TABLES.tasks,
      t1,
      COLUMNS.tasks.completedAt,
      new Date(2026, 6, 23, 15, 0, 0).toISOString(),
    );

    const t2 = createTask(store, { title: 'T2' });
    setTaskStatus(store, t2, TASK_STATUS.done);
    store.setCell(
      TABLES.tasks,
      t2,
      COLUMNS.tasks.completedAt,
      new Date(2026, 6, 23, 8, 0, 0).toISOString(),
    );

    const t3 = createTask(store, { title: 'T3' });
    setTaskStatus(store, t3, TASK_STATUS.done);
    store.setCell(
      TABLES.tasks,
      t3,
      COLUMNS.tasks.completedAt,
      new Date(2026, 6, 25, 10, 0, 0).toISOString(),
    );

    const items = getCompletedItemsInRange(store, '2026-07-23', '2026-07-26');
    expect(items.map((i) => i.taskId)).toEqual([t2, t1, t3]);
    expect(items.map((i) => i.localDay)).toEqual([
      '2026-07-23',
      '2026-07-23',
      '2026-07-25',
    ]);
  });

  it('getCompletedItemsInRange resolves areaId and rootTaskId through the root placement', () => {
    const area = createArea(store, { name: 'Family' });
    const areaTask = createTask(store, {
      title: 'area-rooted',
      placement: { kind: 'area', id: area },
    });
    setTaskStatus(store, areaTask, TASK_STATUS.done);
    store.setCell(TABLES.tasks, areaTask, COLUMNS.tasks.completedAt, atNoon(2026, 7, 23));

    const childTask = createTask(store, {
      title: 'nested',
      placement: { kind: 'task', id: areaTask },
    });
    setTaskStatus(store, childTask, TASK_STATUS.done);
    store.setCell(TABLES.tasks, childTask, COLUMNS.tasks.completedAt, atNoon(2026, 7, 23));

    const inboxTask = createTask(store, { title: 'inbox' });
    setTaskStatus(store, inboxTask, TASK_STATUS.done);
    store.setCell(TABLES.tasks, inboxTask, COLUMNS.tasks.completedAt, atNoon(2026, 7, 23));

    const items = getCompletedItemsInRange(store, '2026-07-23', '2026-07-23');
    const byTask = new Map(items.map((i) => [i.taskId, i]));
    expect(byTask.get(areaTask)?.areaId).toBe(area);
    expect(byTask.get(areaTask)?.rootTaskId).toBe(areaTask);
    expect(byTask.get(childTask)?.areaId).toBe(area);
    expect(byTask.get(childTask)?.rootTaskId).toBe(areaTask);
    expect(byTask.get(inboxTask)?.areaId).toBeNull();
    expect(byTask.get(inboxTask)?.rootTaskId).toBe(inboxTask);
  });

  it('getCompletedItemsInRange drops the row when the task is reopened (no completedAt, not done)', () => {
    const t = createTask(store, { title: 'flap' });
    setTaskStatus(store, t, TASK_STATUS.done);
    store.setCell(TABLES.tasks, t, COLUMNS.tasks.completedAt, atNoon(2026, 7, 23));
    expect(
      getCompletedItemsInRange(store, '2026-07-23', '2026-07-23').map(
        (i) => i.taskId,
      ),
    ).toContain(t);
    setTaskStatus(store, t, TASK_STATUS.open);
    expect(
      getCompletedItemsInRange(store, '2026-07-23', '2026-07-23'),
    ).toEqual([]);
  });
});