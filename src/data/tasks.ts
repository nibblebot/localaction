import { useRow } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES, TASK_STATUS } from './schema.ts';
import type { TaskStatus } from './schema.ts';
import { newId, nowIso, normalizeRelation, row, useTableVersion } from './internal.ts';
import type { Task, TaskInput, TaskPatch, TaskPlacement } from './types.ts';
import { moveTask, readSiblingOrders } from './order.ts';

/**
 * Normalize a stored `completedAt` cell. Empty strings, `undefined`,
 * and `null` all map to `null` (never completed). Other primitives are
 * coerced via `String(...)` so e.g. a numeric `Date.now()` survives a
 * round-trip through a CSV import.
 */
export function normalizeCompletedAt(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  return String(raw);
}

/**
 * Placement reference encoding. A task's single `placement`
 * cell holds `${kind}:${id}` for area/task roots, or is
 * absent for an Inbox root. Parts are UUIDs, so `:` is a safe
 * separator.
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
  if (kind === 'area' || kind === 'task') {
    return { kind, id };
  }
  // Unknown or legacy kinds resolve to the Inbox.
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
  // One explicit transaction for the whole patch: the completion-timestamp
  // helper, the delCell side-effects, and the final row write are separate
  // implicit transactions otherwise — non-atomic, and read as several
  // changes downstream (e.g. one sync-log push per transaction).
  store.transaction(() => {
    // Stamp / clear the completion timestamp BEFORE the status write so
    // the helper observes the previous (pre-patch) status. Calling
    // afterward would read the just-written `done` and treat the open →
    // done transition as a no-op.
    if (patch.status !== undefined) {
      writeCompletionTimestamp(store, id, patch.status);
    }
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
  });
}

/**
 * Side-effect helper: keep the `completedAt` cell in sync with a status
 * transition. Called by both `setTaskStatus` and the `status` arm of
 * `updateTask` so the timestamp writes stay co-located (no risk of one
 * path diverging). No-ops when the stored status already matches the
 * next value (idempotent re-set) so a touch that doesn't actually
 * change completion doesn't bump the timestamp.
 *
 * - transitioning to `done` from non-done → stamp `nowIso()`.
 * - transitioning from `done` to non-done → `delCell` (absent cell).
 * - unchanged → no-op (preserves the original timestamp).
 */
export function writeCompletionTimestamp(
  store: MergeableStore,
  id: string,
  next: TaskStatus,
): void {
  if (!store.hasRow(TABLES.tasks, id)) return;
  const current = store.getCell(TABLES.tasks, id, COLUMNS.tasks.status);
  const currentIsDone = current === TASK_STATUS.done;
  if (next === TASK_STATUS.done && !currentIsDone) {
    store.setPartialRow(
      TABLES.tasks,
      id,
      row({ [COLUMNS.tasks.completedAt]: nowIso() }),
    );
  } else if (next !== TASK_STATUS.done && currentIsDone) {
    store.delCell(TABLES.tasks, id, COLUMNS.tasks.completedAt);
  }
}

/**
 * Set a task's stored status. The read-time invariant ("done ⟺ all
 * descendants done") is enforced by `getDerivedStatus`, a read-time
 * derivation (no write cascade): completing a leaf flips it to done;
 * a parent's done state is fully derived from its descendants, so a
 * parent's own stored cell is ignored while it has children. Reopening
 * a leaf writes only that one cell — ancestors re-derive to open at
 * read time, so no reopen gating is needed.
 */
export function setTaskStatus(store: MergeableStore, id: string, status: TaskStatus): void {
  if (!store.hasRow(TABLES.tasks, id)) return;
  // One explicit transaction: the timestamp stamp and the status write
  // are two implicit transactions otherwise — non-atomic, and observed
  // downstream as two separate changes (e.g. two sync-log pushes).
  store.transaction(() => {
    // Stamp / clear the completion timestamp BEFORE the status write so
    // the helper observes the previous stored status — calling it
    // afterward would read the just-written `done` and treat the open →
    // done transition as a no-op.
    writeCompletionTimestamp(store, id, status);
    store.setPartialRow(
      TABLES.tasks,
      id,
      row({
        [COLUMNS.tasks.status]: status,
        [COLUMNS.tasks.updatedAt]: nowIso(),
      }),
    );
  });
}

export function getTask(store: MergeableStore, id: string): Task | undefined {
  const r = store.getRow(TABLES.tasks, id);
  if (!r || Object.keys(r).length === 0) return undefined;
  return decodeTaskRow(id, r);
}

/**
 * Derived status at read time. A leaf (no children) reflects its
 * stored cell directly; a parent (≥1 child) is `done` iff every
 * descendant is derived-done — its own stored cell is ignored.
 * Returns undefined when the row is missing.
 */
export function getDerivedStatus(
  store: MergeableStore,
  id: string,
  _version = 0,
): TaskStatus | undefined {
  if (!store.hasRow(TABLES.tasks, id)) return undefined;
  return derivedStatus(store, id);
}

function derivedStatus(store: MergeableStore, id: string): TaskStatus {
  const children = childTaskIds(store, id);
  if (children.length === 0) {
    // Leaf: the stored cell is the truth.
    return store.getCell(TABLES.tasks, id, COLUMNS.tasks.status) === TASK_STATUS.done
      ? TASK_STATUS.done
      : TASK_STATUS.open;
  }
  // Parent: done iff every descendant is derived-done; the parent's own
  // stored cell is ignored while it has children.
  for (const child of children) {
    if (derivedStatus(store, child) !== TASK_STATUS.done) return TASK_STATUS.open;
  }
  return TASK_STATUS.done;
}

/**
 * A root task's tri-state: `'done'` when the derived status is done
 * (wins over backlog); else `'backlog'` when the backlog cell is
 * truthy; else `'active'`. Roots only — subtasks inherit through
 * ancestry.
 */
export function getRootTriState(
  store: MergeableStore,
  rootId: string,
): 'active' | 'backlog' | 'done' {
  if (getDerivedStatus(store, rootId) === TASK_STATUS.done) return 'done';
  if (store.getCell(TABLES.tasks, rootId, COLUMNS.tasks.backlog)) {
    return 'backlog';
  }
  return 'active';
}

/**
 * Set or clear a root's backlog shelf state. `shelved` true writes the
 * backlog cell; false deletes it (Active is the default — absent cell).
 * Only meaningful on roots; subtasks inherit through ancestry.
 */
export function setRootBacklog(
  store: MergeableStore,
  rootId: string,
  shelved: boolean,
): void {
  if (!store.hasRow(TABLES.tasks, rootId)) return;
  store.transaction(() => {
    if (shelved) {
      store.setCell(TABLES.tasks, rootId, COLUMNS.tasks.backlog, true);
    } else {
      store.delCell(TABLES.tasks, rootId, COLUMNS.tasks.backlog);
    }
    store.setCell(TABLES.tasks, rootId, COLUMNS.tasks.updatedAt, nowIso());
  });
}

/**
 * Snapshot a task's CURRENT derived status into its stored status
 * cell. Used by parent→leaf conversion (move/delete paths) BEFORE the
 * last child is removed: the derived state (full meter → checked box;
 * partial → open) becomes the now-leaf's stored checkbox. Maintains
 * `completedAt` via `writeCompletionTimestamp` semantics (the stamp /
 * clear must observe the pre-snapshot stored status, so it runs before
 * the status write).
 */
export function snapshotDerivedIntoStored(store: MergeableStore, id: string): void {
  if (!store.hasRow(TABLES.tasks, id)) return;
  const derived = derivedStatus(store, id);
  writeCompletionTimestamp(store, id, derived);
  store.setPartialRow(
    TABLES.tasks,
    id,
    row({
      [COLUMNS.tasks.status]: derived,
      [COLUMNS.tasks.updatedAt]: nowIso(),
    }),
  );
}

/**
 * Done/total counts across ALL descendants of `id` (excluding `id` itself — a leaf has an empty
 * subtree). "Done" uses the derived status so the meter matches what
 * the tree renders. Drives the parent-row progress meter.
 */
export function getSubtreeProgress(
  store: MergeableStore,
  id: string,
  _version = 0,
): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const tid of descendantTaskIds(store, id).slice(1)) {
    total += 1;
    if (derivedStatus(store, tid) === TASK_STATUS.done) done += 1;
  }
  return { done, total };
}

/**
 * Reactive counterpart of `getSubtreeProgress`. Subscribes to the
 * tasks table so any descendant change re-renders callers.
 */
export function useSubtreeProgress(
  store: MergeableStore,
  id: string | undefined,
): { done: number; total: number } {
  // Same version-token pattern as useInboxTaskIds — without it the
  // singleton `store` reference alone leaves a stale count across
  // re-renders.
  const v = useTableVersion(store, TABLES.tasks);
  if (!id || !store.hasRow(TABLES.tasks, id)) return { done: 0, total: 0 };
  return getSubtreeProgress(store, id, v);
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

/**
 * The top-level ancestor of `id` (the root task), found by walking the
 * `task:<id>` placement chain. A root returns itself. Returns
 * undefined when the row is missing; an orphaned sub-task resolves to
 * its highest surviving ancestor.
 */
export function getRootTaskId(store: MergeableStore, id: string): string | undefined {
  if (!store.hasRow(TABLES.tasks, id)) return undefined;
  let cur = id;
  const guard = new Set<string>();
  for (;;) {
    if (guard.has(cur)) return undefined;
    guard.add(cur);
    const p = getPlacement(store, cur);
    if (p.kind !== 'task') return cur;
    if (!store.hasRow(TABLES.tasks, p.id)) return cur;
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
 * `children` as the top-level rows. Or pass one id (an area
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
 * Prune done subtrees out of a task tree, once. A node is pruned iff
 * its effective root's tri-state is `'done'` — a completed subtask of
 * an Active or Backlog root renders in place (strikethrough), never
 * pruned; only when the whole root resolves done does the subtree
 * drop. Sibling order is preserved.
 */
export function pruneDoneTasks(
  store: MergeableStore,
  nodes: readonly TaskTreeNode[],
): TaskTreeNode[] {
  const out: TaskTreeNode[] = [];
  for (const node of nodes) {
    const rootId = getRootTaskId(store, node.id);
    if (rootId !== undefined && getRootTriState(store, rootId) === 'done') continue;
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
    backlog: Boolean(r[COLUMNS.tasks.backlog]),
    dueDate: normalizeRelation(r[COLUMNS.tasks.dueDate]),
    completedAt: normalizeCompletedAt(r[COLUMNS.tasks.completedAt]),
    order: Number(r[COLUMNS.tasks.order] ?? 0),
    createdAt: String(r[COLUMNS.tasks.createdAt] ?? ''),
    updatedAt: String(r[COLUMNS.tasks.updatedAt] ?? ''),
  };
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

export function useDerivedTaskStatus(
  store: MergeableStore,
  id: string | undefined,
): TaskStatus | undefined {
  // Same version-token pattern as useInboxTaskIds — without it the
  // singleton `store` reference alone leaves a stale status across
  // re-renders.
  const v = useTableVersion(store, TABLES.tasks);
  if (!id || !store.hasRow(TABLES.tasks, id)) return undefined;
  return getDerivedStatus(store, id, v);
}

export function useTask(store: MergeableStore, id: string | undefined): Task | undefined {
  const r = useRow(TABLES.tasks, id ?? '', store);
  if (!id || !r || Object.keys(r).length === 0) return undefined;
  return decodeTaskRow(id, r);
}
