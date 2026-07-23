import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES, TASK_STATUS } from './schema.ts';
import { getArea, getAllAreaIdsFlat } from './areas.ts';
import { getRootPlacement, getTasksForProjectDeep, getEffectiveTaskStatus } from './tasks.ts';
import { useTableVersion } from './internal.ts';
import type { Area } from './types.ts';

/**
 * The area a task ultimately belongs to (resolved through its placement
 * chain, ADR-0001), or null for Inbox-rooted / orphaned tasks.
 */
function taskOwningArea(store: MergeableStore, taskId: string): string | null {
  const root = getRootPlacement(store, taskId);
  if (root.kind === 'area') return root.id;
  if (root.kind === 'project') {
    const a = store.getCell(TABLES.projects, root.id, COLUMNS.projects.areaId);
    return typeof a === 'string' ? a : null;
  }
  return null;
}

export interface AreaCount {
  id: string;
  name: string;
  parentId: string | null;
  color: Area['color'];
  order: number;
  childCount: number;
  projectCount: number;
  taskCount: number;
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
  const projectIds = store.getRowIds(TABLES.projects);
  const taskIds = store.getRowIds(TABLES.tasks);
  const noteIds = store.getRowIds(TABLES.notes);

  const projectArea = new Map<string, string | null>();
  for (const pid of projectIds) {
    projectArea.set(
      pid,
      typeof store.getCell(TABLES.projects, pid, COLUMNS.projects.areaId) === 'string'
        ? String(store.getCell(TABLES.projects, pid, COLUMNS.projects.areaId))
        : null,
    );
  }
  const taskArea = new Map<string, string | null>();
  for (const tid of taskIds) {
    taskArea.set(tid, taskOwningArea(store, tid));
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
  const directProjectCount = new Map<string, number>();
  for (const did of allAreaIds) {
    directSubAreaCount.set(did, 0);
    directProjectCount.set(did, 0);
  }
  for (const id of allAreaIds) {
    const parent = store.getCell(TABLES.areas, id, COLUMNS.areas.parentId);
    if (typeof parent === 'string') {
      directSubAreaCount.set(parent, (directSubAreaCount.get(parent) ?? 0) + 1);
    }
  }
  for (const pid of projectIds) {
    const aId = projectArea.get(pid) ?? null;
    if (!aId) continue;
    directProjectCount.set(aId, (directProjectCount.get(aId) ?? 0) + 1);
  }

  const projectCount = new Map<string, number>();
  const taskCount = new Map<string, number>();
  const noteCount = new Map<string, number>();
  for (const did of allAreaIds) {
    projectCount.set(did, 0);
    taskCount.set(did, 0);
    noteCount.set(did, 0);
  }

  for (const pid of projectIds) {
    const aId = projectArea.get(pid) ?? null;
    if (!aId) continue;
    for (const owner of descendantsOf.get(aId) ?? []) {
      projectCount.set(owner, (projectCount.get(owner) ?? 0) + 1);
    }
  }
  for (const tid of taskIds) {
    const aId = taskArea.get(tid) ?? null;
    if (!aId) continue;
    for (const owner of descendantsOf.get(aId) ?? []) {
      taskCount.set(owner, (taskCount.get(owner) ?? 0) + 1);
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
      childCount:
        (directSubAreaCount.get(did) ?? 0) + (directProjectCount.get(did) ?? 0),
      projectCount: projectCount.get(did) ?? 0,
      taskCount: taskCount.get(did) ?? 0,
      noteCount: noteCount.get(did) ?? 0,
    };
  });
}

export function useAreaCounts(store: MergeableStore): AreaCount[] {
  // The version token bumps on any change to the four source tables,
  // feeding the cache key the React Compiler uses to decide whether to
  // re-run the derivation (row moves like `moveArea` only touch cells —
  // a row-id subscription alone would serve the stale order).
  const v =
    useTableVersion(store, TABLES.areas) +
    useTableVersion(store, TABLES.projects) +
    useTableVersion(store, TABLES.tasks) +
    useTableVersion(store, TABLES.notes);
  return getAreaCounts(store, v);
}

export function getNotesForAreaTree(
  store: MergeableStore,
  areaId: string,
  _version = 0,
): { areaNotes: string[]; projectNotes: string[]; taskNotes: string[] } {
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
  const projectNotes: string[] = [];
  const taskNotes: string[] = [];
  for (const nid of store.getRowIds(TABLES.notes)) {
    const type = String(store.getCell(TABLES.notes, nid, COLUMNS.notes.entityType) ?? '');
    const eId = store.getCell(TABLES.notes, nid, COLUMNS.notes.entityId);
    if (typeof eId !== 'string') continue;
    if (type === 'area' && descendants.has(eId)) {
      areaNotes.push(nid);
    } else if (type === 'project') {
      const pArea = store.getCell(TABLES.projects, eId, COLUMNS.projects.areaId);
      if (typeof pArea === 'string' && descendants.has(pArea)) {
        projectNotes.push(nid);
      }
    } else if (type === 'task') {
      const aId = taskOwningArea(store, eId);
      if (typeof aId === 'string' && descendants.has(aId)) {
        taskNotes.push(nid);
      }
    }
  }
  return { areaNotes, projectNotes, taskNotes };
}

export function useNotesForAreaTree(
  store: MergeableStore,
  areaId: string,
): { areaNotes: string[]; projectNotes: string[]; taskNotes: string[] } {
  const v =
    useTableVersion(store, TABLES.areas) +
    useTableVersion(store, TABLES.projects) +
    useTableVersion(store, TABLES.tasks) +
    useTableVersion(store, TABLES.notes);
  return getNotesForAreaTree(store, areaId, v);
}

export interface ProjectRollup {
  projectId: string;
  areaId: string | null;
  projectName: string;
  order: number;
  done: number;
  total: number;
}

export function useProjectRollups(store: MergeableStore): ProjectRollup[] {
  // Rollups read projects + tasks (via getTasksForProjectDeep, which
  // also walks sections) — the token watches all three.
  const v =
    useTableVersion(store, TABLES.projects) +
    useTableVersion(store, TABLES.tasks) +
    useTableVersion(store, TABLES.sections);
  return getProjectRollups(store, v);
}

export function getProjectRollups(
  store: MergeableStore,
  _version = 0,
): ProjectRollup[] {
  const projectIds = store.getRowIds(TABLES.projects);
  const projectArea = new Map<string, string | null>();
  for (const pid of projectIds) {
    projectArea.set(
      pid,
      typeof store.getCell(TABLES.projects, pid, COLUMNS.projects.areaId) === 'string'
        ? String(store.getCell(TABLES.projects, pid, COLUMNS.projects.areaId))
        : null,
    );
  }
  const projectRollups: ProjectRollup[] = [];
  for (const pid of projectIds) {
    const areaIdRaw = store.getCell(TABLES.projects, pid, COLUMNS.projects.areaId);
    const areaId = typeof areaIdRaw === 'string' ? areaIdRaw : null;
    const name = String(store.getCell(TABLES.projects, pid, COLUMNS.projects.name) ?? '');
    const order = Number(store.getCell(TABLES.projects, pid, COLUMNS.projects.order) ?? 0);
    let done = 0;
    let total = 0;
    for (const tid of getTasksForProjectDeep(store, pid)) {
      total += 1;
      if (getEffectiveTaskStatus(store, tid) === TASK_STATUS.done) done += 1;
    }
    projectRollups.push({ projectId: pid, areaId, projectName: name, order, done, total });
  }
  return projectRollups;
}

export interface DueItem {
  kind: 'task' | 'project';
  id: string;
  /** The matched due date (`YYYY-MM-DD`, local calendar day). */
  dueDate: string;
  /** Owning area id (resolved through the placement chain), or null for Inbox-rooted items. */
  areaId: string | null;
  /** Owning project id, or null for Inbox / area-rooted tasks. */
  projectId: string | null;
  /**
   * Effective completion state. Always false for projects (they have no
   * status cell); tasks use the read-time derivation so a stored-done
   * parent with open children still reads open.
   */
  done: boolean;
}

/**
 * Every task and project due in the inclusive local-date range
 * [`from`, `to`] (`YYYY-MM-DD` strings), across ALL placements — Inbox
 * roots, area roots, projects, sections, and nested sub-tasks. String
 * comparison on the date-only ISO cell is an exact calendar-day match:
 * no timestamps, no timezone math. Today is the degenerate range
 * `from === to`. Items are ordered by due date, then their sibling
 * `order` cell within each kind.
 */
export function getDueItems(
  store: MergeableStore,
  from: string,
  to: string,
  _version = 0,
): DueItem[] {
  const items: DueItem[] = [];
  for (const pid of store.getRowIds(TABLES.projects)) {
    const due = store.getCell(TABLES.projects, pid, COLUMNS.projects.dueDate);
    if (typeof due !== 'string' || due < from || due > to) continue;
    const areaRaw = store.getCell(TABLES.projects, pid, COLUMNS.projects.areaId);
    items.push({
      kind: 'project',
      id: pid,
      dueDate: due,
      areaId: typeof areaRaw === 'string' ? areaRaw : null,
      projectId: pid,
      done: false,
    });
  }
  for (const tid of store.getRowIds(TABLES.tasks)) {
    const due = store.getCell(TABLES.tasks, tid, COLUMNS.tasks.dueDate);
    if (typeof due !== 'string' || due < from || due > to) continue;
    const root = getRootPlacement(store, tid);
    let areaId: string | null = null;
    let projectId: string | null = null;
    if (root.kind === 'area') {
      areaId = root.id;
    } else if (root.kind === 'project') {
      projectId = root.id;
      const areaRaw = store.getCell(TABLES.projects, projectId, COLUMNS.projects.areaId);
      areaId = typeof areaRaw === 'string' ? areaRaw : null;
    }
    items.push({
      kind: 'task',
      id: tid,
      dueDate: due,
      areaId,
      projectId,
      done: getEffectiveTaskStatus(store, tid) === TASK_STATUS.done,
    });
  }
  const orderOf = (item: DueItem): number =>
    Number(
      store.getCell(
        item.kind === 'task' ? TABLES.tasks : TABLES.projects,
        item.id,
        item.kind === 'task' ? COLUMNS.tasks.order : COLUMNS.projects.order,
      ) ?? 0,
    );
  return items.sort((a, b) => {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    const oa = orderOf(a);
    const ob = orderOf(b);
    return oa !== ob ? oa - ob : a.id.localeCompare(b.id);
  });
}

/**
 * Reactive counterpart of `getDueItems`. Watches tasks (due dates,
 * statuses, placements), projects (due dates, area links), and sections
 * (section-rooted tasks resolve their project through the section row).
 */
export function useDueItems(store: MergeableStore, from: string, to: string): DueItem[] {
  const v =
    useTableVersion(store, TABLES.tasks) +
    useTableVersion(store, TABLES.projects) +
    useTableVersion(store, TABLES.sections);
  return getDueItems(store, from, to, v);
}
