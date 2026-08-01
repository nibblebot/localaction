import { useCallback, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  PROJECT_STATUS,
  moveProjectToStatus,
  reorderProject,
  useDataLayer,
} from '../../data/index.ts';
import type { ProjectRollup, ProjectStatus } from '../../data/index.ts';
import type { SortableHandleProps } from '../dnd/SortableList.tsx';
import Group from '../tasks/Group.tsx';
import {
  containerId,
  headerContainerId,
  resolveProjectDrop,
} from '../dnd/projectGroupDrop.ts';
import type { SlicePosition, StatusGroupId } from '../dnd/projectGroupDrop.ts';

/**
 * The project status groups of an area view (Active / Backlog / Done),
 * hoisted above every sub-area rolled into the view: each group header
 * renders once, and the projects of the area and its sub-areas appear
 * as per-area slices inside it (sub-area slices carry their own
 * header). Done is derived from task completion — its rows are static
 * and it is never a drop target.
 *
 * All sortable slices share a single DndContext, so a drag can reorder
 * within a slice AND move a project across the Active ⇄ Backlog
 * boundary of its area. A drop that lands in another area's slice is a
 * no-op (the row snaps back) — cross-area moves are not supported by
 * drag; keeping one context is what lets each area's Active and
 * Backlog slices stay drop-connected while rendered in separate
 * hoisted groups.
 *
 * - The viewed area's Active and Backlog slices are permanent standing
 *   destinations: both render on every area view, even with no
 *   projects at all — the group headers carry the add-project
 *   affordances and are themselves drop targets, so shelving a project
 *   never requires discovering a drop zone that only exists mid-drag.
 *   A sub-area's empty counterpart slice renders only mid-drag
 *   (labeled by its header), so a sub-area's name never repeats across
 *   groups at rest.
 * - A same-slice drop reorders (`reorderProject`); a cross-group drop
 *   within the same area writes the stored status and the new position
 *   in one transaction (`moveProjectToStatus`).
 *
 * Row rendering stays with the caller (`renderSortableRow` /
 * `renderRow`) so the project-row chrome lives in one place.
 */

/** One area's projects inside the hoisted status groups — the viewed
 * area itself or one rolled-in sub-area. */
export interface ProjectStatusSlice {
  areaId: string;
  /** Sub-area display name; null for the viewed area's own slice,
   * which renders headerless at the top of each group. */
  name: string | null;
  /** The area's visible projects, partitioned and in canonical order. */
  active: readonly ProjectRollup[];
  backlog: readonly ProjectRollup[];
  done: readonly ProjectRollup[];
  /** Sub-area header rendered above the slice's rows. */
  header?: ReactNode;
}

const STATUS_FOR_GROUP: Record<StatusGroupId, ProjectStatus> = {
  active: PROJECT_STATUS.active,
  backlog: PROJECT_STATUS.backlog,
};

/**
 * Inert handle used to re-render a row inside the DragOverlay.
 * Identical to the ones in `SortableList.tsx` / `SortableTree.tsx` —
 * duplicated (not shared) because `react/only-export-components` only
 * allows literal constant exports.
 */
const sortableOverlayHandle: SortableHandleProps = {
  ref: () => undefined,
  style: {},
  attributes: {},
  listeners: undefined,
  isDragging: false,
  isOver: false,
};

function SortableProjectSlot({
  id,
  group,
  children: render,
}: {
  id: string;
  group: StatusGroupId;
  children: (handle: SortableHandleProps) => ReactNode;
}): ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id, data: { group } });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : undefined,
  };
  return (
    <div className="sortable-item-slot" role="listitem">
      {render({
        ref: setNodeRef,
        style,
        attributes: attributes as unknown as Record<string, unknown>,
        listeners: listeners as unknown as Record<string, unknown> | undefined,
        isDragging,
        isOver: isOver ?? false,
      })}
    </div>
  );
}

/** One area's slice of a sortable status group: a droppable container
 * holding the slice's header and rows, so a drop below the last row
 * lands at the end of the slice. Invisible at rest and while dragging
 * (the hoisted group headers carry the drop-target affordance); only
 * direct pointer overlap paints `tab-group-drop-over`. */
function SliceDropZone({
  areaId,
  group,
  className,
  children,
}: {
  areaId: string;
  group: StatusGroupId;
  className?: string;
  children: ReactNode;
}): ReactElement {
  const { setNodeRef, isOver } = useDroppable({
    id: containerId(areaId, group),
    data: { group },
  });
  const classes = ['tab-group-droppable'];
  if (className !== undefined) classes.push(className);
  if (isOver) classes.push('tab-group-drop-over');
  return (
    <div ref={setNodeRef} className={classes.join(' ')}>
      {children}
    </div>
  );
}

/** The viewed area's hoisted group header as a drop target: dropping
 * on Active / Backlog appends to the viewed area's slice of that
 * group. Distinct id from the slice containers — header and container
 * are separate droppables in the same DndContext. MUST render inside
 * the DndContext tree: useDroppable called in the component that
 * renders DndContext registers against the default context and never
 * receives collisions. */
function GroupHeaderDropTarget({
  areaId,
  group,
  dragging,
  valid,
  children,
}: {
  areaId: string | undefined;
  group: StatusGroupId;
  /** A drag is in flight. */
  dragging: boolean;
  /** False when the dragged row belongs to another area — the drop
   * would snap back, so the header stays quiet. */
  valid: boolean;
  children: (dropProps: {
    dropRef: (node: HTMLElement | null) => void;
    dropActive: boolean;
    dropOver: boolean;
  }) => ReactNode;
}): ReactElement {
  const { setNodeRef, isOver } = useDroppable({
    id: headerContainerId(areaId ?? '', group),
    disabled: areaId === undefined,
  });
  return (
    <>
      {children({
        dropRef: setNodeRef,
        dropActive: dragging && valid,
        dropOver: isOver && valid,
      })}
    </>
  );
}

export default function ProjectStatusGroups({
  slices,
  collapsedGroups,
  onToggleGroup,
  renderGroupAction,
  renderSortableRow,
  renderRow,
}: {
  /** The viewed area's slice first, then one slice per rolled-in
   * sub-area (depth-first). */
  slices: readonly ProjectStatusSlice[];
  collapsedGroups: ReadonlySet<string>;
  onToggleGroup: (id: StatusGroupId | 'done') => void;
  /** Action rendered at the right edge of the Active / Backlog group
   * headers (e.g. the per-group add-project "+"). Done gets none. */
  renderGroupAction?: (group: StatusGroupId) => ReactNode;
  renderSortableRow: (p: ProjectRollup, handle: SortableHandleProps) => ReactNode;
  renderRow: (p: ProjectRollup) => ReactNode;
}): ReactElement {
  const { store } = useDataLayer();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // The viewed area's slice (name === null) is the hoisted headers'
  // drop destination. The droppable hooks live in GroupHeaderDropTarget
  // INSIDE the DndContext tree — called here they'd register against
  // the default context and never receive collisions.
  const viewedAreaId = slices.find((s) => s.name === null)?.areaId;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Locate a project id across every slice's sortable groups. */
  const findPosition = useCallback(
    (projectId: string): SlicePosition | null => {
      for (const s of slices) {
        if (s.active.some((p) => p.projectId === projectId)) {
          return { areaId: s.areaId, group: 'active' };
        }
        if (s.backlog.some((p) => p.projectId === projectId)) {
          return { areaId: s.areaId, group: 'backlog' };
        }
      }
      return null;
    },
    [slices],
  );

  const idsIn = useCallback(
    (pos: SlicePosition): string[] => {
      const slice = slices.find((s) => s.areaId === pos.areaId);
      if (!slice) return [];
      const rows = pos.group === 'active' ? slice.active : slice.backlog;
      return rows.map((p) => p.projectId);
    },
    [slices],
  );

  const handleStart = useCallback((event: DragStartEvent) => {
    setDraggingId(String(event.active.id));
  }, []);

  const handleEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingId(null);
      const { active: dragged, over } = event;
      if (!over) return;
      const dragId = String(dragged.id);
      const overId = String(over.id);

      const resolved = resolveProjectDrop(dragId, overId, findPosition, idsIn);
      if (!resolved) return;
      const { source, target, beforeId } = resolved;

      // Cross-area drops are a no-op — the row snaps back. Projects
      // change areas only from their own edit affordances, never by
      // drag, so a merged hoisted list can't reparent by accident.
      if (target.areaId !== source.areaId) return;

      if (target.group === source.group) {
        if (beforeId === dragId) return;
        reorderProject(store, dragId, beforeId);
      } else {
        moveProjectToStatus(store, dragId, STATUS_FOR_GROUP[target.group], beforeId);
      }
    },
    [store, findPosition, idsIn],
  );

  const handleCancel = useCallback(() => {
    setDraggingId(null);
  }, []);

  const draggingSource = draggingId === null ? null : findPosition(draggingId);

  // Both of the viewed area's slices are permanent standing
  // destinations: each renders even when the area has no projects at
  // all, so the group headers (and their add affordances) are always
  // present and shelving never requires discovering a target that
  // only exists mid-drag. A sub-area's empty counterpart slice
  // renders only mid-drag (labeled by its header) so its name never
  // repeats across groups at rest. With no rows, only the viewed
  // area's two slices render.
  //
  // sliceHasContent is the narrower "is there anything to show" verdict:
  // rows on screen, or the live drop destination of the in-flight
  // drag. Only then does a slice paint its chrome (sub-area header) —
  // the viewed area's slice is always in the rendered list, so without
  // this gate an empty one would paint a stray "Area projects" header
  // and the group would grow/shrink on every collapse toggle.
  const sliceHasContent = (
    s: ProjectStatusSlice,
    rows: readonly ProjectRollup[],
    otherGroup: StatusGroupId,
  ): boolean =>
    rows.length > 0 ||
    (draggingSource?.areaId === s.areaId && draggingSource.group === otherGroup);

  const activeSliceVisible = (s: ProjectStatusSlice): boolean =>
    s.name === null || sliceHasContent(s, s.active, 'backlog');
  const backlogSliceVisible = (s: ProjectStatusSlice): boolean =>
    s.name === null || sliceHasContent(s, s.backlog, 'active');

  const activeSlices = slices.filter(activeSliceVisible);
  const backlogSlices = slices.filter(backlogSliceVisible);
  const doneSlices = slices.filter((s) => s.done.length > 0);

  const sortableIds = slices.flatMap((s) => [
    ...s.active.map((p) => p.projectId),
    ...s.backlog.map((p) => p.projectId),
  ]);
  const draggingRollup = slices
    .flatMap((s) => [...s.active, ...s.backlog])
    .find((p) => p.projectId === draggingId);

  const sortableListLabel = (s: ProjectStatusSlice, title: string): string =>
    s.name === null ? `${title} projects` : `${title} projects in ${s.name}`;

  return (
    <DndContext
      sensors={sensors}
      // pointerWithin is precise over a row (and required for the
      // slice-container drop targets); rectIntersection covers the
      // gaps between rows. Same rationale as SortableList.
      collisionDetection={(args) => {
        const pointerCollisions = pointerWithin(args);
        if (pointerCollisions.length > 0) return pointerCollisions;
        return rectIntersection(args);
      }}
      onDragStart={handleStart}
      onDragEnd={handleEnd}
      onDragCancel={handleCancel}
      accessibility={{
        announcements: {
          onDragStart: ({ active: a }) => `Picked up ${String(a.id)}.`,
          onDragOver: ({ active: a, over }) =>
            over
              ? `${String(a.id)} is over ${String(over.id)}.`
              : `${String(a.id)} is no longer over a droppable.`,
          onDragEnd: ({ active: a, over }) =>
            over
              ? `Dropped ${String(a.id)} on ${String(over.id)}.`
              : `Dropped ${String(a.id)} outside the list.`,
          onDragCancel: ({ active: a }) => `Cancelled drag of ${String(a.id)}.`,
        },
        screenReaderInstructions: {
          draggable:
            'To pick up a draggable item, press space or enter. While dragging, use the arrow keys to move the item. Press space or enter again to drop the item in its new position, or press escape to cancel.',
        },
      }}
    >
      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        {activeSlices.length > 0 && (
          <GroupHeaderDropTarget
            areaId={viewedAreaId}
            group="active"
            dragging={draggingId !== null}
            valid={draggingSource?.areaId === viewedAreaId}
          >
            {(dropProps) => (
              <Group
                title="Active"
                count={activeSlices.reduce((n, s) => n + s.active.length, 0)}
                collapsed={collapsedGroups.has('active')}
                onToggleCollapse={() => onToggleGroup('active')}
                hasContent={activeSlices.some((s) => sliceHasContent(s, s.active, 'backlog'))}
                trailing={renderGroupAction?.('active')}
                dropRef={dropProps.dropRef}
                dropActive={dropProps.dropActive}
                dropOver={dropProps.dropOver}
              >
                {activeSlices.map((s) => {
                  return (
                    <SliceDropZone
                      key={s.areaId}
                      areaId={s.areaId}
                      group="active"
                      className={s.name === null ? undefined : 'subarea-section'}
                    >
                      {sliceHasContent(s, s.active, 'backlog') && s.header}
                      {s.active.length > 0 && (
                        <div
                          className="sortable-list"
                          role="list"
                          aria-label={sortableListLabel(s, 'Active')}
                        >
                          {s.active.map((p) => (
                            <SortableProjectSlot key={p.projectId} id={p.projectId} group="active">
                              {(handle) => renderSortableRow(p, handle)}
                            </SortableProjectSlot>
                          ))}
                        </div>
                      )}
                    </SliceDropZone>
                  );
                })}
              </Group>
            )}
          </GroupHeaderDropTarget>
        )}
        {backlogSlices.length > 0 && (
          <GroupHeaderDropTarget
            areaId={viewedAreaId}
            group="backlog"
            dragging={draggingId !== null}
            valid={draggingSource?.areaId === viewedAreaId}
          >
            {(dropProps) => (
              <Group
                title="Backlog"
                count={backlogSlices.reduce((n, s) => n + s.backlog.length, 0)}
                collapsed={collapsedGroups.has('backlog')}
                onToggleCollapse={() => onToggleGroup('backlog')}
                hasContent={backlogSlices.some((s) => sliceHasContent(s, s.backlog, 'active'))}
                trailing={renderGroupAction?.('backlog')}
                dropRef={dropProps.dropRef}
                dropActive={dropProps.dropActive}
                dropOver={dropProps.dropOver}
              >
                {backlogSlices.map((s) => {
                  return (
                    <SliceDropZone
                      key={s.areaId}
                      areaId={s.areaId}
                      group="backlog"
                      className={s.name === null ? undefined : 'subarea-section'}
                    >
                      {sliceHasContent(s, s.backlog, 'active') && s.header}
                      {s.backlog.length > 0 && (
                        <div
                          className="sortable-list"
                          role="list"
                          aria-label={sortableListLabel(s, 'Backlog')}
                        >
                          {s.backlog.map((p) => (
                            <SortableProjectSlot key={p.projectId} id={p.projectId} group="backlog">
                              {(handle) => renderSortableRow(p, handle)}
                            </SortableProjectSlot>
                          ))}
                        </div>
                      )}
                    </SliceDropZone>
                  );
                })}
              </Group>
            )}
          </GroupHeaderDropTarget>
        )}
      </SortableContext>
      {doneSlices.length > 0 && (
        <Group
          title="Done"
          count={doneSlices.reduce((n, s) => n + s.done.length, 0)}
          collapsed={collapsedGroups.has('done')}
          onToggleCollapse={() => onToggleGroup('done')}
        >
          {doneSlices.map((s) => (
            <div
              key={s.areaId}
              className={s.name === null ? undefined : 'subarea-section'}
            >
              {s.header}
              {s.done.map((p) => renderRow(p))}
            </div>
          ))}
        </Group>
      )}
      <DragOverlay className="drag-overlay" dropAnimation={null}>
        {draggingRollup
          ? renderSortableRow(draggingRollup, sortableOverlayHandle)
          : null}
      </DragOverlay>
    </DndContext>
  );
}
