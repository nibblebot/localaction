/**
 * Shared plumbing behind the project task list — used by the project
 * view's Tasks tab and by every per-project group in the area view's
 * Tasks rollup. Returns the project's deep task ids in canonical
 * order plus per-ancestor subtask progress.
 */
import { useMemo } from 'react';
import {
  useDataLayer,
  useTasksForProjectDeep,
  sortTaskIds,
  getPlacement,
  getEffectiveTaskStatus,
  TASK_STATUS,
} from '../data/index.ts';

export function useProjectTaskList(projectId: string): {
  /** All of the project's tasks (top-level + nested), unordered. */
  taskIds: string[];
  /** Deep list in canonical order. */
  visibleIds: string[];
  /** Per-ancestor subtask progress over the project's full deep list. */
  subtaskProgress: ReadonlyMap<string, { done: number; total: number }>;
} {
  const { store } = useDataLayer();
  const taskIds = useTasksForProjectDeep(store, projectId);
  const visibleIds = useMemo(() => sortTaskIds(store, taskIds), [store, taskIds]);
  // Per-ancestor subtask progress: every task contributes 1 to each
  // task ancestor's total, plus 1 to done when the task itself is
  // effectively done — the same counting getProjectRollups uses, so
  // task and project meters can never disagree. taskIds already
  // re-derives on tasks/sections table changes, status edits included.
  const subtaskProgress = useMemo(() => {
    const progress = new Map<string, { done: number; total: number }>();
    for (const id of taskIds) {
      const done = getEffectiveTaskStatus(store, id) === TASK_STATUS.done;
      const guard = new Set<string>();
      let cur = id;
      for (;;) {
        if (guard.has(cur)) break;
        guard.add(cur);
        const p = getPlacement(store, cur);
        if (p.kind !== 'task') break;
        const entry = progress.get(p.id) ?? { done: 0, total: 0 };
        entry.total += 1;
        if (done) entry.done += 1;
        progress.set(p.id, entry);
        cur = p.id;
      }
    }
    return progress;
  }, [store, taskIds]);
  return { taskIds, visibleIds, subtaskProgress };
}
