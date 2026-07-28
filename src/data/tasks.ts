import { useRow } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES, TASK_STATUS } from './schema.ts';
import type { TaskStatus } from './schema.ts';
import { newId, nowIso, normalizeRelation, row, useTableVersion } from './internal.ts';
import type { Task, TaskInput, TaskPatch, TaskPlacement } from './types.ts';
import { moveTask, readSiblingOrders } from './order.ts';
import { getSectionIdsForProject } from './sections.ts';

/**
 * Placement reference encoding. A task's single `placement`
 * cell holds `${kind}:${id}` for project/section/area/task roots, or is
 * absent for an Inbox root. Parts are UUIDs, so `:` is a safe
 * separator. `section:<id>` marks a top-level task inside
 * a project Section; the owning project resolves through the section row.
 */
export const PLACEMENT_SEP = ':';

export function encodePlacement(p: TaskPlacement): string | null {
  if (p.kind === 'inbox') return null;
  return `${p.kind}${PLACEMENT_SEP}${p.id}`;
}

export function decodePlacement(raw: unknown): TaskPlacement {
  if (typeof raw !== 'string' || raw === '') return { kind: 'inbox' };
  const idx = raw.indexOf(PLACEMENT_SEP);
  if (idx <= 0) return { kind: 'inbox' };
  const kind = raw.slice(0, idx);
  const id = raw.slice(idx + 1);
  if (id === '') return { kind: 'inbox' };
  if (kind === 'project' || kind === 'area' || kind === 'section' || kind === 'task') {
    return { kind, id };
  }
  return { kind: 'inbox' };
}

function nextOrder(store: MergeableStore, placement: string | null): number {
  const siblings = readSiblingOrders(
    store,
    TABLES.tasks,
    COLUMNS.tasks.placement,
    placement,
  );
  const last = siblings[siblings.length - 1];
  if (!last) return 1000;
  return last.order + 1000;
}

export function createTask(store: MergeableStore, input: TaskInput): string {
  const id = newId();
  const ts = nowIso();
  const status = input.status ?? TASK_STATUS.open;
  const placement = input.placement ?? { kind: 'inbox' };
  const encoded = encodePlacement(placement);
  const order = input.order ?? nextOrder(store, encoded);
  store.setRow(
    TABLES.tasks,
    id,
    row({
      [COLUMNS.tasks.title]: input.title,
      [COLUMNS.tasks.placement]: encoded,
      [COLUMNS.tasks.status]: status,
      [COLUMNS.tasks.order]: order,
      [COLUMNS.tasks.createdAt]: ts,
      [COLUMNS.tasks.updatedAt]: ts,
    }),
  );
  return id;
}

/**
 * Create a task as the next sibling after `afterId`: same placement,
 * ordered immediately below it. Backs quick entry (Shift+Enter in a
 * task title saves and opens a fresh row under the current one).
 * Returns null when `afterId` no longer exists.
 */
export function createTaskAfter(
  store: MergeableStore,
  afterId: string,
  title: string,
): string | null {
  if (!store.hasRow(TABLES.tasks, afterId)) return null;
  const placement = getRawPlacement(store, afterId);
  const id = createTask(store, { title, placement: decodePlacement(placement) });
  const siblings = readSiblingOrders(store, TABLES.tasks, COLUMNS.tasks.placement, placement);
  const idx = siblings.findIndex((s) => s.id === afterId);
  const beforeId = idx >= 0 ? siblings[idx + 1]?.id : undefined;
  // `createTask` appends to the end of the sibling group; only move when
  // a real sibling follows `afterId` (the end-append is already right
  // when `afterId` was last, where the row after it is the new task).
  if (beforeId !== undefined && beforeId !== id) {
    moveTask(store, id, placement, beforeId);
  }
  return id;
}

export function updateTask(store: MergeableStore, id: string, patch: TaskPatch): void {
  if (!store.hasRow(TABLES.tasks, id)) return;
  const next: Record<string, string | number | null | undefined> = {
    [COLUMNS.tasks.updatedAt]: nowIso(),
  };
  if (patch.title !== undefined) next[COLUMNS.tasks.title] = patch.title;
  if (patch.status !== undefined) next[COLUMNS.tasks.status] = patch.status;
  if (patch.placement !== undefined) {
    const encoded = encodePlacement(patch.placement);
    if (encoded === null) {
      store.delCell(TABLES.tasks, id, COLUMNS.tasks.placement);
    } else {
      next[COLUMNS.tasks.placement] = encoded;
    }
  }
  if (patch.order !== undefined) next[COLUMNS.tasks.order] = patch.order;
  if (patch.dueDate === null) {
    store.delCell(TABLES.tasks, id, COLUMNS.tasks.dueDate);
  } else if (patch.dueDate !== undefined) {
    next[COLUMNS.tasks.dueDate] = patch.dueDate;
  }
  store.setPartialRow(TABLES.tasks, id, row(next));
}

/**
 * Set a task's stored status. The read-time invariant
 * ("done ⟺ all descendants done") is enforced by `getEffectiveTaskStatus`,
 * a read-time-derivation pattern (no write cascade):
 * completing a leaf flips it to done; completing a parent while a child
 * is still open leaves the parent stored-done but effective-open until
 * the last child is completed. Reopening any task writes only that one
 * cell — ancestors re-derive to open at read time ("reopening a
 * descendant reopens every ancestor").
 */
export function setTaskStatus(store: MergeableStore, id: string, status: TaskStatus): void {
  if (!store.hasRow(TABLES.tasks, id)) return;
  store.setPartialRow(
    TABLES.tasks,
    id,
    row({
      [COLUMNS.tasks.status]: status,
      [COLUMNS.tasks.updatedAt]: nowIso(),
    }),
  );
}

export function getTask(store: MergeableStore, id: string): Task | undefined {
  const r = store.getRow(TABLES.tasks, id);
  if (!r || Object.keys(r).length === 0) return undefined;
  return decodeTaskRow(id, r);
}

/**
 * Effective status at read time. A stored-`done` task is only effectively
 * done when every descendant is effectively done; otherwise it is `open`.
 * Leaves (no children) reflect their stored cell directly.
 */
export function getEffectiveTaskStatus(
  store: MergeableStore,
  id: string,
  _version = 0,
): TaskStatus | undefined {
  if (!store.hasRow(TABLES.tasks, id)) return undefined;
  return effectiveStatus(store, id);
}

function effectiveStatus(store: MergeableStore, id: string): TaskStatus {
  const stored = store.getCell(TABLES.tasks, id, COLUMNS.tasks.status);
  if (stored !== TASK_STATUS.done) return TASK_STATUS.open;
  for (const child of childTaskIds(store, id)) {
    if (effectiveStatus(store, child) !== TASK_STATUS.done) return TASK_STATUS.open;
  }
  return TASK_STATUS.done;
}

// --- placement read helpers -------------------------------------------------

export function getRawPlacement(store: MergeableStore, id: string): string | null {
  return normalizeRelation(store.getCell(TABLES.tasks, id, COLUMNS.tasks.placement));
}

export function getPlacement(store: MergeableStore, id: string): TaskPlacement {
  return decodePlacement(getRawPlacement(store, id));
}

/**
 * Walk up the parent chain to the owning root. A Sub-Task resolves
 * ownership through its ancestry; an orphaned sub-task
 * (parent gone) resolves to the Inbox. A Section root resolves to the
 * section's owning Project (a missing section resolves to the Inbox).
 */
export function getRootPlacement(store: MergeableStore, id: string): TaskPlacement {
  let cur = id;
  const guard = new Set<string>();
  for (;;) {
    if (guard.has(cur)) return { kind: 'inbox' };
    guard.add(cur);
    const p = getPlacement(store, cur);
    if (p.kind === 'section') {
      const projectId = normalizeRelation(
        store.getCell(TABLES.sections, p.id, COLUMNS.sections.projectId),
      );
      return projectId === null ? { kind: 'inbox' } : { kind: 'project', id: projectId };
    }
    if (p.kind !== 'task') return p;
    if (!store.hasRow(TABLES.tasks, p.id)) return { kind: 'inbox' };
    cur = p.id;
  }
}

/** Direct children of a task (placement `task:<parentId>`). */
export function childTaskIds(store: MergeableStore, parentId: string): string[] {
  const target = `task${PLACEMENT_SEP}${parentId}`;
  const out: string[] = [];
  for (const id of store.getRowIds(TABLES.tasks)) {
    if (getRawPlacement(store, id) === target) out.push(id);
  }
  return out;
}

/** A task and its full transitive subtree (root first). */
export function descendantTaskIds(store: MergeableStore, rootId: string): string[] {
  const out: string[] = [rootId];
  collectDescendants(store, rootId, out);
  return out;
}

/**
 * Tree node built from a flat task id list, keyed by `id`. `children`
 * holds the ordered ids of direct sub-tasks (placement = `task:<id>`);
 * an empty array means a leaf.
 */
export interface TaskTreeNode {
  id: string;
  children: TaskTreeNode[];
}

/**
 * Build a depth-first tree from a flat list of task ids. Sibling order
 * is taken from each task's `order` cell (ties broken by id) so the
 * caller can render the structure in store order without re-sorting.
 * The root of the returned tree has `id` `__root__` and its `children`
 * are the input list — pass any subset of tasks and treat the root's
 * `children` as the top-level rows. Or pass one id (a project/area
 * container id) and the matching tasks: sub-tasks of that container
 * become the root's children.
 */
export function buildTaskTree(store: MergeableStore, taskIds: readonly string[]): TaskTreeNode {
  const orderOf = (id: string): number =>
    Number(store.getCell(TABLES.tasks, id, COLUMNS.tasks.order) ?? 0);
  const childMap = new Map<string, string[]>();
  for (const id of taskIds) {
    const p = getPlacement(store, id);
    if (p.kind !== 'task') continue;
    if (!taskIds.includes(p.id)) continue;
    const list = childMap.get(p.id);
    if (list) list.push(id);
    else childMap.set(p.id, [id]);
  }
  for (const list of childMap.values()) {
    list.sort((a, b) => {
      const oa = orderOf(a);
      const ob = orderOf(b);
      return oa !== ob ? oa - ob : a.localeCompare(b);
    });
  }
  const build = (id: string): TaskTreeNode => {
    const childIds = childMap.get(id) ?? [];
    return { id, children: childIds.map(build) };
  };
  return { id: '__root__', children: taskIds.filter((id) => {
    const p = getPlacement(store, id);
    return p.kind !== 'task' || !taskIds.includes(p.id);
  }).sort((a, b) => {
    const oa = orderOf(a);
    const ob = orderOf(b);
    return oa !== ob ? oa - ob : a.localeCompare(b);
  }).map(build) };
}

function collectDescendants(
  store: MergeableStore,
  parentId: string,
  out: string[],
): void {
  for (const child of childTaskIds(store, parentId)) {
    out.push(child);
    collectDescendants(store, child, out);
  }
}

/**
 * Prune done subtrees out of a task tree, once, so hidden-completed
 * mode drops a done task and everything nested under it. Sibling
 * order is preserved.
 */
export function pruneDoneTasks(
  store: MergeableStore,
  nodes: readonly TaskTreeNode[],
): TaskTreeNode[] {
  const out: TaskTreeNode[] = [];
  for (const node of nodes) {
    const done =
      store.hasRow(TABLES.tasks, node.id) &&
      store.getCell(TABLES.tasks, node.id, COLUMNS.tasks.status) === TASK_STATUS.done;
    if (done) continue;
    out.push({ id: node.id, children: pruneDoneTasks(store, node.children) });
  }
  return out;
}

/** Canonical task ordering: `order` cell ascending, id as tiebreak. */
export function sortTaskIds(store: MergeableStore, ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const oa = Number(store.getCell(TABLES.tasks, a, COLUMNS.tasks.order) ?? 0);
    const ob = Number(store.getCell(TABLES.tasks, b, COLUMNS.tasks.order) ?? 0);
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b);
  });
}

/** Top-level (non-sub-task) tasks whose placement equals `encoded`. */
export function topLevelTaskIdsForPlacement(
  store: MergeableStore,
  encoded: string | null,
): string[] {
  const out: string[] = [];
  for (const id of store.getRowIds(TABLES.tasks)) {
    if (getRawPlacement(store, id) === encoded) out.push(id);
  }
  return out;
}

/**
 * Non-reactive: walk all tasks under a project (top-level + nested).
 * Use `useTasksForProjectDeep` from React to subscribe.
 */
export function getTasksForProjectDeep(
  store: MergeableStore,
  projectId: string,
  _version = 0,
): string[] {
  const out: string[] = [];
  for (const top of topLevelTaskIdsForPlacement(store, `project${PLACEMENT_SEP}${projectId}`)) {
    out.push(top);
    collectDescendants(store, top, out);
  }
  // Section-rooted top-level tasks belong to the project too — their
  // placement points at the section, not the project.
  for (const sid of getSectionIdsForProject(store, projectId)) {
    for (const top of topLevelTaskIdsForPlacement(store, `section${PLACEMENT_SEP}${sid}`)) {
      out.push(top);
      collectDescendants(store, top, out);
    }
  }
  return out;
}

/** Non-reactive: top-level Inbox tasks (placement absent). */
export function getInboxTaskIds(store: MergeableStore, _version = 0): string[] {
  return topLevelTaskIdsForPlacement(store, null);
}

/** Non-reactive: top-level Area-owned tasks for `areaId`. */
export function getAreaTaskIds(store: MergeableStore, areaId: string, _version = 0): string[] {
  return topLevelTaskIdsForPlacement(store, `area${PLACEMENT_SEP}${areaId}`);
}

function decodeTaskRow(id: string, r: Record<string, unknown>): Task {
  return {
    id,
    title: String(r[COLUMNS.tasks.title] ?? ''),
    placement: decodePlacement(r[COLUMNS.tasks.placement]),
    status: (String(r[COLUMNS.tasks.status] ?? TASK_STATUS.open)) as TaskStatus,
    dueDate: normalizeRelation(r[COLUMNS.tasks.dueDate]),
    order: Number(r[COLUMNS.tasks.order] ?? 0),
    createdAt: String(r[COLUMNS.tasks.createdAt] ?? ''),
    updatedAt: String(r[COLUMNS.tasks.updatedAt] ?? ''),
  };
}

/**
 * Reactive counterpart: returns the full flattened list of task ids in
 * the project (top-level + nested). Subscribes to the tasks table so any
 * descendant change re-renders callers.
 */
export function useTasksForProjectDeep(store: MergeableStore, projectId: string): string[] {
  // Reads tasks (rows + placement cells) and, via sections, the
  // sections table — the version token covers both.
  const v = useTableVersion(store, TABLES.tasks) + useTableVersion(store, TABLES.sections);
  return getTasksForProjectDeep(store, projectId, v);
}

export function useInboxTaskIds(store: MergeableStore): string[] {
  // The version token feeds the React Compiler's memo cache key so the
  // result re-derives when the table changes; without it the compiler
  // caches on the singleton `store` reference alone and returns a stale
  // list across re-renders (see useAreaCounts for the same pattern).
  const v = useTableVersion(store, TABLES.tasks);
  return getInboxTaskIds(store, v);
}

export function useAreaTaskIds(store: MergeableStore, areaId: string): string[] {
  const v = useTableVersion(store, TABLES.tasks);
  return getAreaTaskIds(store, areaId, v);
}

export function useEffectiveTaskStatus(
  store: MergeableStore,
  id: string | undefined,
): TaskStatus | undefined {
  // Same version-token pattern as useInboxTaskIds — without it the
  // singleton `store` reference alone leaves a stale status across
  // re-renders.
  const v = useTableVersion(store, TABLES.tasks);
  if (!id || !store.hasRow(TABLES.tasks, id)) return undefined;
  return getEffectiveTaskStatus(store, id, v);
}

export function useTask(store: MergeableStore, id: string | undefined): Task | undefined {
  const r = useRow(TABLES.tasks, id ?? '', store);
  if (!id || !r || Object.keys(r).length === 0) return undefined;
  return decodeTaskRow(id, r);
}
