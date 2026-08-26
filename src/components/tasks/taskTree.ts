import { useMemo } from 'react';
import type { MergeableStore } from 'tinybase';
import { getPlacement, getRootTriState, useTableVersion, TABLES } from '../../data/index.ts';

/**
 * Depth-first collect of a task's descendant ids by following the
 * `task:<parentId>` placement of every row in the tasks table. Pushes
 * into the caller's buffer so it composes with the parent's own id.
 */
export function collectChildIds(
  store: MergeableStore,
  parentId: string,
  out: string[],
): void {
  if (!parentId) return;
  for (const id of store.getRowIds(TABLES.tasks)) {
    const p = getPlacement(store, id);
    if (p.kind === 'task' && p.id === parentId) {
      out.push(id);
      collectChildIds(store, id, out);
    }
  }
}

/**
 * Flat deep list (top-level ids + all descendants) for a set of root
 * tasks. The tasks-table version token makes the tree re-derive when
 * children are added/removed/moved — the roots' array identity alone
 * is a stale gate when a parent's CHILD set changes without the root
 * list changing (e.g. adding a sub-task from a detail pane).
 */
export function useDeepTaskIds(
  store: MergeableStore,
  topLevelIds: readonly string[],
): string[] {
  const tasksV = useTableVersion(store, TABLES.tasks);
  return useMemo(() => {
    void tasksV;
    const out: string[] = [];
    for (const t of topLevelIds) {
      out.push(t);
      collectChildIds(store, t, out);
    }
    return out;
  }, [topLevelIds, store, tasksV]);
}

/**
 * Count of visible top-level rows for a group. Completed tasks are
 * always visible in place under active/backlog roots (no showCompleted
 * plumbing anymore); only a fully-done root's subtree is pruned, so a
 * done-rooted top-level row counts as hidden.
 */
export function countVisibleTopLevel(
  store: MergeableStore,
  ids: readonly string[],
): number {
  let n = 0;
  for (const tid of ids) {
    if (getRootTriState(store, tid) !== 'done') n += 1;
  }
  return n;
}