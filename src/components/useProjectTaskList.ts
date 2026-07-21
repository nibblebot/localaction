/**
 * Shared plumbing behind the project task list — used by the project
 * view's Tasks tab and by every per-project group in the area view's
 * Tasks rollup. Returns the project's deep task ids in canonical
 * order, the person-filter-visible subset, and the hidden count for
 * the "N tasks hidden" stub.
 */
import { useMemo } from 'react';
import {
  useDataLayer,
  useTableVersion,
  useTasksForProjectDeep,
  useHiddenCount,
  peopleForEntity,
  sortTaskIds,
  NOTE_ENTITY_TYPE,
  TABLES,
} from '../data/index.ts';
import { usePersonFilter } from './persons/usePersonFilter.ts';

export function useProjectTaskList(projectId: string): {
  /** All of the project's tasks (top-level + nested), unordered. */
  taskIds: string[];
  /** Deep list in canonical order, narrowed by the person filter. */
  visibleIds: string[];
  /** Tasks excluded by the person filter. */
  hiddenCount: number;
} {
  const { store } = useDataLayer();
  const taskIds = useTasksForProjectDeep(store, projectId);
  const { selected: filter } = usePersonFilter();
  const hiddenCount = useHiddenCount(store, NOTE_ENTITY_TYPE.task, taskIds, filter);
  const orderedIds = useMemo(() => sortTaskIds(store, taskIds), [store, taskIds]);
  // person_links/persons changes must re-run the imperative
  // peopleForEntity filter below — the token joins the memo deps.
  const personsV = useTableVersion(store, TABLES.persons) + useTableVersion(store, TABLES.person_links);
  const visibleIds = useMemo(() => {
    void personsV; // invalidation token: person_links/persons edits re-run the peopleForEntity filter
    if (filter.length === 0) return orderedIds;
    const set = new Set(filter);
    return orderedIds.filter((tid) => {
      for (const id of peopleForEntity(store, NOTE_ENTITY_TYPE.task, tid)) {
        if (set.has(id)) return true;
      }
      return false;
    });
  }, [store, orderedIds, filter, personsV]);
  return { taskIds, visibleIds, hiddenCount };
}
