import { useMemo } from 'react';
import type { MergeableStore } from 'tinybase';
import {
  getEffectiveTaskStatus,
  getPlacement,
  TABLES,
  TASK_STATUS,
} from '../../data/index.ts';

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
 * tasks. Memoized on the root list + store identity — the roots come
 * from a TinyBase selector hook that already re-runs on table changes.
 */
export function useDeepTaskIds(
  store: MergeableStore,
  topLevelIds: readonly string[],
): string[] {
  return useMemo(() => {
    const out: string[] = [];
    for (const t of topLevelIds) {
      out.push(t);
      collectChildIds(store, t, out);
    }
    return out;
  }, [topLevelIds, store]);
}

/**
 * Count of visible top-level rows under the completed-task filter:
 * all of them when completed tasks show, else those whose effective
 * status is not `done`.
 */
export function countVisibleTopLevel(
  store: MergeableStore,
  ids: readonly string[],
  showCompleted: boolean,
): number {
  if (showCompleted) return ids.length;
  let n = 0;
  for (const tid of ids) {
    if (getEffectiveTaskStatus(store, tid) !== TASK_STATUS.done) n += 1;
  }
  return n;
}
