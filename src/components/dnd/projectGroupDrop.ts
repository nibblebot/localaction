/**
 * Drop-target resolution for the hoisted project status groups
 * (Active / Backlog). Pure functions so the append/reorder semantics
 * of every drop surface — slice containers, group headers, and rows —
 * are unit-testable without a DndContext.
 *
 * Two droppable id schemes share one DndContext with project ids:
 * - `project-group:<areaId>:<group>` — one area's slice container.
 * - `project-group-head:<areaId>:<group>` — a hoisted group header.
 * Both prefixes parse to the same SlicePosition; a header drop means
 * "append to the end of that area's slice".
 */

export type StatusGroupId = 'active' | 'backlog';

export interface SlicePosition {
  areaId: string;
  group: StatusGroupId;
}

export function containerId(areaId: string, group: StatusGroupId): string {
  return `project-group:${areaId}:${group}`;
}

export function headerContainerId(areaId: string, group: StatusGroupId): string {
  return `project-group-head:${areaId}:${group}`;
}

export function parseContainerId(id: string): SlicePosition | null {
  const prefix = id.startsWith('project-group-head:')
    ? 'project-group-head:'
    : id.startsWith('project-group:')
      ? 'project-group:'
      : null;
  if (prefix === null) return null;
  const sep = id.lastIndexOf(':');
  const group = id.slice(sep + 1);
  if (group !== 'active' && group !== 'backlog') return null;
  const areaId = id.slice(prefix.length, sep);
  if (areaId === '') return null;
  return { areaId, group };
}

export interface ProjectDropResolution {
  /** The dragged row's current slice. */
  source: SlicePosition;
  target: SlicePosition;
  /** Row to insert before; undefined appends at the end of the slice. */
  beforeId: string | undefined;
}

/**
 * Resolve a drag's `over` id to a target slice and insertion point.
 * Container/header drops append (`beforeId` undefined); row drops
 * insert before the row, with the same-gap translation SortableList
 * uses (the hidden dragging row keeps its slot, so the landing gap
 * shifts by one when moving down past the row it sat above). Returns
 * null when the drop has no meaningful target.
 */
export function resolveProjectDrop(
  dragId: string,
  overId: string,
  findPosition: (projectId: string) => SlicePosition | null,
  idsIn: (pos: SlicePosition) => string[],
): ProjectDropResolution | null {
  if (dragId === overId) return null;
  const source = findPosition(dragId);
  if (!source) return null;
  const overContainer = parseContainerId(overId);
  if (overContainer) return { source, target: overContainer, beforeId: undefined };
  const target = findPosition(overId);
  if (!target) return null;
  if (target.areaId === source.areaId && target.group === source.group) {
    const ids = idsIn(source);
    const overIdx = ids.indexOf(overId);
    const activeIdx = ids.indexOf(dragId);
    if (activeIdx < 0 || activeIdx < overIdx) {
      const next = ids[overIdx + 1];
      return { source, target, beforeId: next === dragId ? ids[overIdx + 2] : next };
    }
    return { source, target, beforeId: ids[overIdx] };
  }
  // Cross-slice: the drop lands right before the `over` row.
  return { source, target, beforeId: overId };
}
