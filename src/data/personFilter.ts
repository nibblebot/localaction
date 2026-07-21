import type { MergeableStore } from 'tinybase';
import { COLUMNS, NOTE_ENTITY_TYPE, TABLES } from './schema.ts';
import type { NoteEntityType } from './schema.ts';
import { peopleForEntity } from './personSelectors.ts';
import { getRootPlacement } from './tasks.ts';
import { useTableVersion } from './internal.ts';

/**
 * Any-of (OR) match per the spec. An entity matches if any of its
 * people is in `filter` (filter ∩ people ≠ ∅).
 *
 * Self is always present in every entity's people (I5, I7), so
 * filtering to {Self} matches every entity. Empty filter = no
 * filter = match all.
 */
function entityMatches(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
  filter: ReadonlySet<string>,
): boolean {
  if (filter.size === 0) return true;
  const set = peopleForEntity(store, entityType, entityId);
  for (const id of set) {
    if (filter.has(id)) return true;
  }
  return false;
}

/**
 * Set of descendant area ids for the given root (inclusive). Same
 * transitive walk the `getNotesForAreaTree` helper uses, factored out
 * so the filter check can decide "any match in this area subtree".
 */
function descendantAreaIds(store: MergeableStore, rootId: string): Set<string> {
  const out = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const id of store.getRowIds(TABLES.areas)) {
      const parent = store.getCell(TABLES.areas, id, COLUMNS.areas.parentId);
      if (typeof parent === 'string' && out.has(parent) && !out.has(id)) {
        out.add(id);
        added = true;
      }
    }
  }
  return out;
}

/**
 * True if a task's owning root (resolved through its placement chain,
 * ADR-0001) falls inside the area `subtree`. Inbox-rooted or orphaned
 * tasks never belong to an area subtree.
 */
function taskInSubtree(
  store: MergeableStore,
  taskId: string,
  subtree: ReadonlySet<string>,
): boolean {
  const root = getRootPlacement(store, taskId);
  if (root.kind === 'area') return subtree.has(root.id);
  if (root.kind === 'project') {
    const a = store.getCell(TABLES.projects, root.id, COLUMNS.projects.areaId);
    return typeof a === 'string' && subtree.has(a);
  }
  return false;
}

/**
 * True if the given area or any of its descendants has an entity
 * (project, task, note) whose effective person set matches `filter`.
 * Returns `true` when the filter is empty (no filter = everything).
 *
 * Sidebar uses this to dim zero-match areas (spec § 8.6).
 */
export function areaHasMatch(
  store: MergeableStore,
  areaId: string,
  filter: ReadonlySet<string>,
): boolean {
  if (filter.size === 0) return true;
  const subtree = descendantAreaIds(store, areaId);

  // Direct area-level match (e.g. a person directly tagged to the area,
  // though that case is rare — every area has at least {Self}).
  if (entityMatches(store, NOTE_ENTITY_TYPE.area, areaId, filter)) return true;

  // Projects in any of the descendant areas.
  for (const pid of store.getRowIds(TABLES.projects)) {
    const projectArea = store.getCell(TABLES.projects, pid, COLUMNS.projects.areaId);
    if (typeof projectArea !== 'string' || !subtree.has(projectArea)) continue;
    if (entityMatches(store, NOTE_ENTITY_TYPE.project, pid, filter)) return true;
  }
  // Tasks whose owning root (project or area) is in the subtree.
  for (const tid of store.getRowIds(TABLES.tasks)) {
    if (!taskInSubtree(store, tid, subtree)) continue;
    if (entityMatches(store, NOTE_ENTITY_TYPE.task, tid, filter)) return true;
  }

  // Notes directly attached to the area.
  for (const nid of store.getRowIds(TABLES.notes)) {
    const t = store.getCell(TABLES.notes, nid, COLUMNS.notes.entityType);
    const e = store.getCell(TABLES.notes, nid, COLUMNS.notes.entityId);
    if (t !== NOTE_ENTITY_TYPE.area) continue;
    if (typeof e !== 'string' || !subtree.has(e)) continue;
    if (entityMatches(store, NOTE_ENTITY_TYPE.area, e, filter)) return true;
  }

  return false;
}

/**
 * Counts of *matching* (project/task/note) entities for the area
 * subtree. Used to update sidebar counts under an active filter
 * (spec § 8.2 — "live counts switch to filtered totals").
 */
export interface FilteredAreaCount {
  projectCount: number;
  taskCount: number;
  noteCount: number;
}

export function getFilteredAreaCounts(
  store: MergeableStore,
  areaId: string,
  filter: ReadonlySet<string>,
): FilteredAreaCount {
  const subtree = descendantAreaIds(store, areaId);
  let projectCount = 0;
  let taskCount = 0;
  let noteCount = 0;

  for (const pid of store.getRowIds(TABLES.projects)) {
    const a = store.getCell(TABLES.projects, pid, COLUMNS.projects.areaId);
    if (typeof a !== 'string' || !subtree.has(a)) continue;
    if (entityMatches(store, NOTE_ENTITY_TYPE.project, pid, filter)) projectCount += 1;
  }
  for (const tid of store.getRowIds(TABLES.tasks)) {
    if (!taskInSubtree(store, tid, subtree)) continue;
    if (entityMatches(store, NOTE_ENTITY_TYPE.task, tid, filter)) taskCount += 1;
  }
  for (const nid of store.getRowIds(TABLES.notes)) {
    const t = store.getCell(TABLES.notes, nid, COLUMNS.notes.entityType);
    const e = store.getCell(TABLES.notes, nid, COLUMNS.notes.entityId);
    if (typeof e !== 'string' || !subtree.has(e)) continue;
    if (t === NOTE_ENTITY_TYPE.area) {
      if (entityMatches(store, NOTE_ENTITY_TYPE.area, e, filter)) noteCount += 1;
    } else if (t === NOTE_ENTITY_TYPE.project) {
      if (entityMatches(store, NOTE_ENTITY_TYPE.project, e, filter)) noteCount += 1;
    } else if (t === NOTE_ENTITY_TYPE.task) {
      if (entityMatches(store, NOTE_ENTITY_TYPE.task, e, filter)) noteCount += 1;
    }
  }
  return { projectCount, taskCount, noteCount };
}

// --- React hooks ---------------------------------------------------------

/**
 * Reactive: the set of area ids that have zero matches under the
 * active filter. Sidebar dims them; the full tree stays visible.
 */
export function useDimmedAreaIds(
  store: MergeableStore,
  areaIds: readonly string[],
  filter: readonly string[],
): Set<string> {
  const v =
    useTableVersion(store, TABLES.persons) +
    useTableVersion(store, TABLES.person_links) +
    useTableVersion(store, TABLES.areas) +
    useTableVersion(store, TABLES.projects) +
    useTableVersion(store, TABLES.tasks) +
    useTableVersion(store, TABLES.notes);
  void v;
  if (filter.length === 0) return new Set();
  const set = new Set(filter);
  const dimmed = new Set<string>();
  for (const id of areaIds) {
    if (!areaHasMatch(store, id, set)) dimmed.add(id);
  }
  return dimmed;
}

/**
 * Reactive: matching totals per area for the active filter.
 * Sidebar uses this to advertise filtered counts ("where does Mom
 * have work?"). With no filter active the map is empty — callers
 * fall back to the unfiltered `AreaCount` row.
 */
export function useFilteredAreaCounts(
  store: MergeableStore,
  areaIds: readonly string[],
  filter: readonly string[],
): Map<string, FilteredAreaCount> {
  const v =
    useTableVersion(store, TABLES.persons) +
    useTableVersion(store, TABLES.person_links) +
    useTableVersion(store, TABLES.areas) +
    useTableVersion(store, TABLES.projects) +
    useTableVersion(store, TABLES.tasks) +
    useTableVersion(store, TABLES.notes);
  void v;
  if (filter.length === 0) return new Map();
  const set = new Set(filter);
  const out = new Map<string, FilteredAreaCount>();
  for (const id of areaIds) {
    out.set(id, getFilteredAreaCounts(store, id, set));
  }
  return out;
}

/**
 * Reactive: which top-level rows in the MainPane content (project
 * lists, task lists, note lists) are hidden under the active filter.
 * MainPane uses this to render the "N hidden" stub.
 */
export function useHiddenCount(
  store: MergeableStore,
  entityType: NoteEntityType,
  rows: readonly string[],
  filter: readonly string[],
): number {
  const v = useTableVersion(store, TABLES.persons) + useTableVersion(store, TABLES.person_links);
  void v;
  if (filter.length === 0) return 0;
  const set = new Set(filter);
  let n = 0;
  for (const id of rows) {
    if (!entityMatches(store, entityType, id, set)) n += 1;
  }
  return n;
}