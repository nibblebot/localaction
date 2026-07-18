import { useRow, useRowIds, useTables } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES, TASK_STATUS } from './schema.ts';
import type { TaskStatus } from './schema.ts';
import { newId, nowIso, normalizeRelation, row } from './internal.ts';
import type { Task, TaskInput, TaskPatch, TaskPlacement } from './types.ts';
import { readSiblingOrders } from './order.ts';

/**
 * Placement reference encoding (ADR-0001). A task's single `placement`
 * cell holds `${kind}:${id}` for project/area/task roots, or is absent
 * for an Inbox root. Parts are UUIDs (or the literal `self`), so `:` is
 * a safe separator.
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
  if (kind === 'project' || kind === 'area' || kind === 'task') {
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
  store.setPartialRow(TABLES.tasks, id, row(next));
}

/**
 * Set a task's stored status. The read-time invariant
 * ("done ⟺ all descendants done") is enforced by `getEffectiveTaskStatus`,
 * mirroring ADR-0001's read-time-derivation pattern (no write cascade):
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
export function getEffectiveTaskStatus(store: MergeableStore, id: string): TaskStatus | undefined {
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
 * ownership through its ancestry (ADR-0001); an orphaned sub-task
 * (parent gone) resolves to the Inbox.
 */
export function getRootPlacement(store: MergeableStore, id: string): TaskPlacement {
  let cur = id;
  const guard = new Set<string>();
  for (;;) {
    if (guard.has(cur)) return { kind: 'inbox' };
    guard.add(cur);
    const p = getPlacement(store, cur);
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
export function getTasksForProjectDeep(store: MergeableStore, projectId: string): string[] {
  const out: string[] = [];
  for (const top of topLevelTaskIdsForPlacement(store, `project${PLACEMENT_SEP}${projectId}`)) {
    out.push(top);
    collectDescendants(store, top, out);
  }
  return out;
}

/** Non-reactive: top-level Inbox tasks (placement absent). */
export function getInboxTaskIds(store: MergeableStore): string[] {
  return topLevelTaskIdsForPlacement(store, null);
}

/** Non-reactive: top-level Area-owned tasks for `areaId`. */
export function getAreaTaskIds(store: MergeableStore, areaId: string): string[] {
  return topLevelTaskIdsForPlacement(store, `area${PLACEMENT_SEP}${areaId}`);
}

function decodeTaskRow(id: string, r: Record<string, unknown>): Task {
  return {
    id,
    title: String(r[COLUMNS.tasks.title] ?? ''),
    placement: decodePlacement(r[COLUMNS.tasks.placement]),
    status: (String(r[COLUMNS.tasks.status] ?? TASK_STATUS.open)) as TaskStatus,
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
  useRowIds(TABLES.tasks, store);
  useTables(store);
  return getTasksForProjectDeep(store, projectId);
}

export function useInboxTaskIds(store: MergeableStore): string[] {
  useRowIds(TABLES.tasks, store);
  useTables(store);
  return getInboxTaskIds(store);
}

export function useAreaTaskIds(store: MergeableStore, areaId: string): string[] {
  useRowIds(TABLES.tasks, store);
  useTables(store);
  return getAreaTaskIds(store, areaId);
}

export function useEffectiveTaskStatus(
  store: MergeableStore,
  id: string | undefined,
): TaskStatus | undefined {
  useTables(store);
  if (!id || !store.hasRow(TABLES.tasks, id)) return undefined;
  return getEffectiveTaskStatus(store, id);
}

export function useTask(store: MergeableStore, id: string | undefined): Task | undefined {
  const r = useRow(TABLES.tasks, id ?? '', store);
  if (!id || !r || Object.keys(r).length === 0) return undefined;
  return decodeTaskRow(id, r);
}
