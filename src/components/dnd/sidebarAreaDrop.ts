/**
 * Drop-target resolution for dragging a task from the main pane
 * (inbox / area view) onto an area or subarea row in the sidebar.
 * Pure so the no-op semantics are unit-testable without a DndContext.
 *
 * The shell-level DndContext spans the sidebar's area tree and the
 * main pane's task trees, so a drag's `over` id can be a task row, a
 * group container, or an area row. Only the (task → area row) pairing
 * resolves here; everything else belongs to the tree/group resolvers
 * (or is a cross-type no-op they already guard against).
 *
 * A resolved drop moves the task to the END of the target area's root
 * list (`moveTask` with `beforeId` undefined). A task whose DIRECT
 * placement already is the target area resolves to null — the drop
 * would change nothing. A subtask's direct placement is its parent
 * task, never an area, so dropping one on a sidebar area always
 * re-roots it there (an actual change, never a no-op).
 */

/**
 * Resolve a drag's `over` id to a sidebar-area drop. Returns the
 * target area id, or null when the drop isn't a task→area move or
 * would be a no-op.
 *
 * `isTask` / `isArea` test id membership (row existence); they
 * disambiguate the shared id space. `directAreaIdOf` maps a task id
 * to the area id of its DIRECT placement (`area:<id>`), or null when
 * the task sits in the inbox or under another task.
 */
export function resolveSidebarAreaDrop(
  dragId: string,
  overId: string | null,
  isTask: (id: string) => boolean,
  isArea: (id: string) => boolean,
  directAreaIdOf: (taskId: string) => string | null,
): string | null {
  if (overId === null || dragId === overId) return null;
  if (!isTask(dragId) || !isArea(overId)) return null;
  if (directAreaIdOf(dragId) === overId) return null;
  return overId;
}
