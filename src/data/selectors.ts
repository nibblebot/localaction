import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES, TASK_STATUS } from './schema.ts';
import { getArea, getAllAreaIdsFlat } from './areas.ts';
import {
  getRootPlacement,
  getRootTaskId,
  getDerivedStatus,
  childTaskIds,
  normalizeCompletedAt,
} from './tasks.ts';
import { useTableVersion, localDayOf } from './internal.ts';
import type { Area } from './types.ts';

/**
 * Resolve a task's owning area through its placement chain (shared by
 * the due-item and completed-item selectors so the two can never
 * drift). Inbox-rooted or orphaned tasks return null.
 */
function taskOwnership(store: MergeableStore, taskId: string): { areaId: string | null } {
  const root = getRootPlacement(store, taskId);
  if (root.kind === 'area') return { areaId: root.id };
  return { areaId: null };
}

export interface AreaCount {
  id: string;
  name: string;
  parentId: string | null;
  color: Area['color'];
  order: number;
  /** Direct sub-area count — drives the sidebar expand caret. */
  childCount: number;
  /** All tasks in the subtree — drives the empty-area dimming. */
  taskCount: number;
  /** Incomplete (derived-open) tasks — the sidebar badge count. */
  openTaskCount: number;
  noteCount: number;
}

/**
 * `version` is a dependency token that React Compiler's optimizer
 * recognises as "used" by the body. Without it, the compiler inlines
 * `getAreaCounts` and elides the actual function call (returning only
 * the cached result). The token has no semantic value — its sole
 * purpose is to invalidate the memoised derivation on table changes.
 */
export function getAreaCounts(store: MergeableStore, _version = 0): AreaCount[] {
  const taskIds = store.getRowIds(TABLES.tasks);
  const noteIds = store.getRowIds(TABLES.notes);

  const taskArea = new Map<string, string | null>();
  for (const tid of taskIds) {
    taskArea.set(tid, taskOwnership(store, tid).areaId);
  }

  const allAreaIds = getAllAreaIdsFlat(store);
  const descendantsOf = new Map<string, Set<string>>();
  for (const did of allAreaIds) {
    const set = new Set<string>([did]);
    let cur: string | null = did;
    while (cur) {
      const d = getArea(store, cur);
      if (!d || d.parentId == null) break;
      set.add(d.parentId);
      cur = d.parentId;
    }
    descendantsOf.set(did, set);
  }

  const directSubAreaCount = new Map<string, number>();
  for (const did of allAreaIds) {
    directSubAreaCount.set(did, 0);
  }
  for (const id of allAreaIds) {
    const parent = store.getCell(TABLES.areas, id, COLUMNS.areas.parentId);
    if (typeof parent === 'string') {
      directSubAreaCount.set(parent, (directSubAreaCount.get(parent) ?? 0) + 1);
    }
  }

  const taskCount = new Map<string, number>();
  const openTaskCount = new Map<string, number>();
  const noteCount = new Map<string, number>();
  for (const did of allAreaIds) {
    taskCount.set(did, 0);
    openTaskCount.set(did, 0);
    noteCount.set(did, 0);
  }

  // Derived-done memo: derived status recurses through children, so
  // resolving it per task would be O(N²). One memoised pass keeps the
  // count loop linear. Matches getDerivedStatus: a leaf reflects its
  // stored cell; a parent is done iff every descendant is derived-done.
  const derivedDone = new Map<string, boolean>();
  const resolveDerivedDone = (id: string): boolean => {
    const cached = derivedDone.get(id);
    if (cached !== undefined) return cached;
    derivedDone.set(id, false); // cycle guard
    const children = childTaskIds(store, id);
    let done: boolean;
    if (children.length === 0) {
      done = store.getCell(TABLES.tasks, id, COLUMNS.tasks.status) === TASK_STATUS.done;
    } else {
      done = true;
      for (const child of children) {
        if (!resolveDerivedDone(child)) {
          done = false;
          break;
        }
      }
    }
    derivedDone.set(id, done);
    return done;
  };

  for (const tid of taskIds) {
    const aId = taskArea.get(tid) ?? null;
    if (!aId) continue;
    for (const owner of descendantsOf.get(aId) ?? []) {
      taskCount.set(owner, (taskCount.get(owner) ?? 0) + 1);
      if (!resolveDerivedDone(tid)) {
        openTaskCount.set(owner, (openTaskCount.get(owner) ?? 0) + 1);
      }
    }
  }
  for (const nid of noteIds) {
    const type = String(store.getCell(TABLES.notes, nid, COLUMNS.notes.entityType) ?? '');
    if (type !== 'area') continue;
    const eId =
      typeof store.getCell(TABLES.notes, nid, COLUMNS.notes.entityId) === 'string'
        ? String(store.getCell(TABLES.notes, nid, COLUMNS.notes.entityId))
        : null;
    if (!eId) continue;
    if (!descendantsOf.has(eId)) continue;
    for (const owner of descendantsOf.get(eId) ?? []) {
      noteCount.set(owner, (noteCount.get(owner) ?? 0) + 1);
    }
  }

  return allAreaIds.map((did) => {
    const d = getArea(store, did);
    return {
      id: did,
      name: d?.name ?? '',
      parentId: d?.parentId ?? null,
      color: d?.color ?? 'gray',
      order: d?.order ?? 0,
      childCount: directSubAreaCount.get(did) ?? 0,
      taskCount: taskCount.get(did) ?? 0,
      openTaskCount: openTaskCount.get(did) ?? 0,
      noteCount: noteCount.get(did) ?? 0,
    };
  });
}

export function useAreaCounts(store: MergeableStore): AreaCount[] {
  // The version token bumps on any change to the three source tables,
  // feeding the cache key the React Compiler uses to decide whether to
  // re-run the derivation (row moves like `moveArea` only touch cells —
  // a row-id subscription alone would serve the stale order).
  const v =
    useTableVersion(store, TABLES.areas) +
    useTableVersion(store, TABLES.tasks) +
    useTableVersion(store, TABLES.notes);
  return getAreaCounts(store, v);
}

export function getNotesForAreaTree(
  store: MergeableStore,
  areaId: string,
  _version = 0,
): { areaNotes: string[]; taskNotes: string[] } {
  const descendants = new Set<string>([areaId]);
  let added = true;
  while (added) {
    added = false;
    for (const id of store.getRowIds(TABLES.areas)) {
      const parent = store.getCell(TABLES.areas, id, COLUMNS.areas.parentId);
      if (typeof parent === 'string' && descendants.has(parent) && !descendants.has(id)) {
        descendants.add(id);
        added = true;
      }
    }
  }

  const areaNotes: string[] = [];
  const taskNotes: string[] = [];
  for (const nid of store.getRowIds(TABLES.notes)) {
    const type = String(store.getCell(TABLES.notes, nid, COLUMNS.notes.entityType) ?? '');
    const eId = store.getCell(TABLES.notes, nid, COLUMNS.notes.entityId);
    if (typeof eId !== 'string') continue;
    if (type === 'area' && descendants.has(eId)) {
      areaNotes.push(nid);
    } else if (type === 'task') {
      const aId = taskOwnership(store, eId).areaId;
      if (typeof aId === 'string' && descendants.has(aId)) {
        taskNotes.push(nid);
      }
    }
  }
  return { areaNotes, taskNotes };
}

export function useNotesForAreaTree(
  store: MergeableStore,
  areaId: string,
): { areaNotes: string[]; taskNotes: string[] } {
  const v =
    useTableVersion(store, TABLES.areas) +
    useTableVersion(store, TABLES.tasks) +
    useTableVersion(store, TABLES.notes);
  return getNotesForAreaTree(store, areaId, v);
}

export interface DueItem {
  kind: 'task';
  id: string;
  /** The matched due date (`YYYY-MM-DD`, local calendar day). */
  dueDate: string;
  /** Owning area id (resolved through the placement chain), or null for Inbox-rooted items. */
  areaId: string | null;
  /** The top-level root task (the item itself when it's already a root). */
  rootTaskId: string;
  /**
   * Derived completion state — a parent's done state reflects its
   * descendants, so a stored-done parent with open children still
   * reads open.
   */
  done: boolean;
}

/**
 * Every task due in the inclusive local-date range [`from`, `to`]
 * (`YYYY-MM-DD` strings), across ALL placements — Inbox roots, area
 * roots, and nested sub-tasks. String comparison on the date-only ISO
 * cell is an exact calendar-day match: no timestamps, no timezone
 * math. Today is the degenerate range `from === to`. Items are ordered
 * by due date, then their sibling `order` cell.
 */
export function getDueItems(
  store: MergeableStore,
  from: string,
  to: string,
  _version = 0,
): DueItem[] {
  const items: DueItem[] = [];
  for (const tid of store.getRowIds(TABLES.tasks)) {
    const due = store.getCell(TABLES.tasks, tid, COLUMNS.tasks.dueDate);
    if (typeof due !== 'string' || due < from || due > to) continue;
    const { areaId } = taskOwnership(store, tid);
    items.push({
      kind: 'task',
      id: tid,
      dueDate: due,
      areaId,
      rootTaskId: getRootTaskId(store, tid) ?? tid,
      done: getDerivedStatus(store, tid) === TASK_STATUS.done,
    });
  }
  const orderOf = (item: DueItem): number =>
    Number(store.getCell(TABLES.tasks, item.id, COLUMNS.tasks.order) ?? 0);
  return items.sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    const oa = orderOf(a);
    const ob = orderOf(b);
    return oa !== ob ? oa - ob : a.id.localeCompare(b.id);
  });
}

/**
 * Reactive counterpart of `getDueItems`. Watches areas, tasks (due
 * dates, statuses, placements), and notes.
 */
export function useDueItems(store: MergeableStore, from: string, to: string): DueItem[] {
  const v =
    useTableVersion(store, TABLES.areas) +
    useTableVersion(store, TABLES.tasks) +
    useTableVersion(store, TABLES.notes);
  return getDueItems(store, from, to, v);
}

export interface CompletedItem {
  taskId: string;
  /** ISO timestamp captured when the task transitioned to `done`. */
  completedAt: string;
  /** Local-calendar day (`YYYY-MM-DD`) the task completed on. */
  localDay: string;
  /** Owning area id (resolved through the placement chain), or null. */
  areaId: string | null;
  /** The top-level root task (the item itself when it's already a root). */
  rootTaskId: string;
}

/**
 * Every task completed within the local-day window `[from, to]` —
 * windowed on `completedAt` alone, never on the task's `dueDate`, so a
 * task with no due date (or a due date far outside the view) still
 * shows under "Done today" / "Done this week" on the day it was
 * checked off. Reactive counterpart: `useCompletedItemsInRange`.
 *
 * Rows with an absent or empty `completedAt` (e.g. pre-migration data)
 * are dropped so the history view never blanks out on an upgrade.
 */
export function getCompletedItemsInRange(
  store: MergeableStore,
  from: string,
  to: string,
  _version = 0,
): CompletedItem[] {
  const items: CompletedItem[] = [];
  for (const tid of store.getRowIds(TABLES.tasks)) {
    const completedRaw = store.getCell(TABLES.tasks, tid, COLUMNS.tasks.completedAt);
    const completedAt = normalizeCompletedAt(completedRaw);
    if (completedAt === null) continue;
    const localDay = localDayOf(completedAt);
    if (localDay < from || localDay > to) continue;
    if (getDerivedStatus(store, tid) !== TASK_STATUS.done) continue;
    const { areaId } = taskOwnership(store, tid);
    items.push({
      taskId: tid,
      completedAt,
      localDay,
      areaId,
      rootTaskId: getRootTaskId(store, tid) ?? tid,
    });
  }
  items.sort((a, b) => {
    if (a.localDay !== b.localDay) return a.localDay < b.localDay ? -1 : 1;
    if (a.completedAt !== b.completedAt) return a.completedAt < b.completedAt ? -1 : 1;
    return a.taskId.localeCompare(b.taskId);
  });
  return items;
}

/**
 * Reactive counterpart of `getCompletedItemsInRange`. Watches the same
 * table set as `useDueItems` — areas, tasks (status, completedAt,
 * dueDate, placements), and notes.
 */
export function useCompletedItemsInRange(
  store: MergeableStore,
  from: string,
  to: string,
): CompletedItem[] {
  const v =
    useTableVersion(store, TABLES.areas) +
    useTableVersion(store, TABLES.tasks) +
    useTableVersion(store, TABLES.notes);
  return getCompletedItemsInRange(store, from, to, v);
}
