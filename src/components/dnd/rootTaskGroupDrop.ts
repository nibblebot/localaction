/**
 * Drop-target resolution for the hoisted root-task groups
 * (Active / Backlog) of the area view and the inbox. Pure functions so
 * the append/insert semantics of every drop surface — the standing
 * group drop zone, the Active/Backlog group headers, and rows — are
 * unit-testable without a DndContext.
 *
 * Two droppable id schemes share one DndContext with task ids:
 * - `task-group:<scopeKey>:<group>` — the standing drop zone that wraps
 *   a group's body (dropping in its empty space appends to the group).
 * - `task-group-head:<scopeKey>:<group>` — a hoisted group header.
 * Both parse to the same GroupTarget; a container/header drop means
 * "append to the end of that group". `scopeKey` is the view's scope —
 * the area-view root area id, or 'inbox'.
 *
 * Only ROOT task ids ever resolve to a group drop (subtasks nest/unnest
 * within their tree, never into a group — callers find no position for
 * them). Reorders write a new sibling position; shelve/unshelve flip
 * the Backlog shelf state — both land through `moveRootToBacklog` /
 * `moveTask` at the call site.
 */

export type RootTaskGroup = 'active' | 'backlog';

/** A group target: the view scope (area id / 'inbox') and the
 * partition group. Done is never a target. */
export interface GroupTarget {
  scopeKey: string;
  group: RootTaskGroup;
}

export function containerId(scopeKey: string, group: RootTaskGroup): string {
  return `task-group:${scopeKey}:${group}`;
}

export function headerContainerId(scopeKey: string, group: RootTaskGroup): string {
  return `task-group-head:${scopeKey}:${group}`;
}

export function parseGroupId(id: string): GroupTarget | null {
  const prefix = id.startsWith('task-group-head:')
    ? 'task-group-head:'
    : id.startsWith('task-group:')
      ? 'task-group:'
      : null;
  if (prefix === null) return null;
  const sep = id.lastIndexOf(':');
  const group = id.slice(sep + 1);
  if (group !== 'active' && group !== 'backlog') return null;
  const scopeKey = id.slice(prefix.length, sep);
  if (scopeKey === '') return null;
  return { scopeKey, group };
}

/** A root's current position inside the hoisted groups: which slice it
 * belongs to and which group (Active / Backlog). */
export interface RootPosition {
  sliceKey: string;
  group: RootTaskGroup;
}

/** A resolved group drop. `beforeId` is undefined when the root appends
 * at the end of the group. */
export interface RootGroupDrop {
  kind: 'reorder' | 'shelve' | 'unshelve';
  beforeId?: string;
}

/**
 * Resolve a drag's `over` id to a group-drop intent. Container/header
 * drops append (`beforeId` undefined); row drops insert before the row,
 * with the same-gap translation SortableList uses (the hidden dragged
 * row keeps its slot, so the landing gap shifts by one when moving down
 * past the row it sat above). Returns null when the drop has no
 * meaningful target (same row, unknown id, Done group, subtask).
 *
 * `findPosition` maps a root id to its slice+group (null for subtasks /
 * done rows); `groupIds` lists a slice's root ids in one group, in
 * canonical order.
 */
export function resolveTaskGroupDrop(
  dragId: string,
  overId: string,
  findPosition: (taskId: string) => RootPosition | null,
  groupIds: (pos: RootPosition) => readonly string[],
): RootGroupDrop | null {
  if (dragId === overId) return null;
  const source = findPosition(dragId);
  if (!source) return null;

  const container = parseGroupId(overId);
  if (container) {
    // Container/header drop appends to the end of the group.
    if (container.group === source.group) return { kind: 'reorder', beforeId: undefined };
    return { kind: container.group === 'backlog' ? 'shelve' : 'unshelve', beforeId: undefined };
  }

  // Row drop: find the target row's group.
  const target = findPosition(overId);
  if (!target) return null;
  if (target.group !== source.group) {
    // Cross-group row drop lands right before the over row.
    return { kind: target.group === 'backlog' ? 'shelve' : 'unshelve', beforeId: overId };
  }
  if (target.sliceKey !== source.sliceKey) {
    // Same group, different slice: ownership change / insert before the
    // over row (the caller maps the target slice to its placement).
    return { kind: 'reorder', beforeId: overId };
  }
  // Same slice, same group: reorder with gap translation.
  const ids = groupIds(source);
  const overIdx = ids.indexOf(overId);
  if (overIdx < 0) return null;
  const activeIdx = ids.indexOf(dragId);
  const beforeId = activeIdx >= 0 && activeIdx < overIdx ? ids[overIdx + 1] : ids[overIdx];
  if (beforeId === undefined || beforeId === dragId) return null;
  return { kind: 'reorder', beforeId };
}
