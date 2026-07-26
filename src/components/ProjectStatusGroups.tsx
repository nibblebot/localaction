import { useCallback, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
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
} from '../data/index.ts';
import type { ProjectRollup, ProjectStatus } from '../data/index.ts';
import type { SortableHandleProps } from './SortableList.tsx';
import Group from './Group.tsx';

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
 * - The viewed area's Backlog slice is a permanent standing drop
 *   destination: it renders on every area view, even with no
 *   projects at all — shelving a project must never require
 *   discovering a drop zone that only exists mid-drag. Its Active
 *   slice renders while the area has any project in either group or
 *   roots its own tasks (to host the read-only tasks rollup). A
 *   sub-area's empty counterpart slice renders only mid-drag
 *   (labeled by its header), so a sub-area's name never repeats
 *   across groups at rest; its Active slice additionally renders
 *   while the sub-area roots its own tasks.
 * - A same-slice drop reorders (`reorderProject`); a cross-group drop
 *   within the same area writes the stored status and the new position
 *   in one transaction (`moveProjectToStatus`).
 *
 * Row rendering stays with the caller (`renderSortableRow` /
 * `renderRow`) so the project-row chrome lives in one place.
 */

type StatusGroupId = 'active' | 'backlog';

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
  /** True while the area roots its own tasks — its Active slice stays
   * visible to host the tasks rollup even with no projects. */
  hasAreaTasks: boolean;
  /** Sub-area header rendered above the slice's rows. */
  header?: ReactNode;
  /** Read-only area-tasks rollup rendered at the top of the Active
   * slice, above the project rows. */
  tasksRollup?: ReactNode;
}

interface SlicePosition {
  areaId: string;
  group: StatusGroupId;
}

/** Droppable container id for one area's slice of a status group.
 * Prefixed so it can never collide with a project id in the same
 * DndContext. */
function containerId(areaId: string, group: StatusGroupId): string {
  return `project-group:${areaId}:${group}`;
}

function parseContainerId(id: string): SlicePosition | null {
  if (!id.startsWith('project-group:')) return null;
  const sep = id.lastIndexOf(':');
  const group = id.slice(sep + 1);
  if (group !== 'active' && group !== 'backlog') return null;
  return { areaId: id.slice('project-group:'.length, sep), group };
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
 * holding the slice's header, optional tasks rollup, and rows. An
 * empty slice keeps a labeled drop zone (see the standing-drop-
 * destination invariant in the module docstring). */
function SliceDropZone({
  areaId,
  group,
  empty,
  className,
  emptyHint,
  children,
}: {
  areaId: string;
  group: StatusGroupId;
  /** True when the slice has no rows — paints the dashed drop zone and
   * renders `emptyHint`. */
  empty: boolean;
  className?: string;
  emptyHint?: string;
  children: ReactNode;
}): ReactElement {
  const { setNodeRef, isOver } = useDroppable({
    id: containerId(areaId, group),
    data: { group },
  });
  const classes = ['tab-group-droppable'];
  if (className !== undefined) classes.push(className);
  if (isOver) classes.push('tab-group-drop-over');
  if (empty) classes.push('tab-group-empty-zone');
  return (
    <div ref={setNodeRef} className={classes.join(' ')}>
      {children}
      {empty && emptyHint !== undefined && (
        <p className="tab-group-empty-hint">{emptyHint}</p>
      )}
    </div>
  );
}

export default function ProjectStatusGroups({
  slices,
  collapsedGroups,
  onToggleGroup,
  renderSortableRow,
  renderRow,
}: {
  /** The viewed area's slice first, then one slice per rolled-in
   * sub-area (depth-first). */
  slices: readonly ProjectStatusSlice[];
  collapsedGroups: ReadonlySet<string>;
  onToggleGroup: (id: StatusGroupId | 'done') => void;
  renderSortableRow: (p: ProjectRollup, handle: SortableHandleProps) => ReactNode;
  renderRow: (p: ProjectRollup) => ReactNode;
}): ReactElement {
  const { store } = useDataLayer();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
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
      if (dragId === overId) return;

      const source = findPosition(dragId);
      if (!source) return;

      let target: SlicePosition;
      let beforeId: string | undefined;
      const overContainer = parseContainerId(overId);
      if (overContainer) {
        // Drop on an empty slice / slice chrome → end of that slice.
        target = overContainer;
        beforeId = undefined;
      } else {
        const overPos = findPosition(overId);
        if (!overPos) return;
        target = overPos;
        if (target.areaId === source.areaId && target.group === source.group) {
          // Same gap translation as SortableList: the hidden dragging
          // row keeps its slot, so the landing gap shifts by one when
          // moving down past the row it sat above.
          const ids = idsIn(source);
          const overIdx = ids.indexOf(overId);
          const activeIdx = ids.indexOf(dragId);
          if (activeIdx < 0 || activeIdx < overIdx) {
            const next = ids[overIdx + 1];
            beforeId = next === dragId ? ids[overIdx + 2] : next;
          } else {
            beforeId = ids[overIdx];
          }
        } else {
          // Cross-slice: the drop lands right before the `over` row.
          beforeId = overId;
        }
      }

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

  // The viewed area's Backlog slice is a permanent standing drop
  // destination: it renders even when the area has no projects at
  // all, so shelving never requires discovering a target that only
  // exists mid-drag. Its Active slice renders while the area has any
  // project in either group (or roots its own tasks, to host the
  // rollup). A sub-area's empty counterpart slice renders only
  // mid-drag (labeled by its header) so its name never repeats across
  // groups at rest; its Active slice additionally renders while the
  // sub-area roots its own tasks. With no rows and no area tasks,
  // only the viewed area's Backlog slice renders.
  const activeSliceVisible = (s: ProjectStatusSlice): boolean =>
    s.active.length > 0 ||
    s.hasAreaTasks ||
    (s.name === null && s.backlog.length > 0) ||
    (draggingSource?.areaId === s.areaId && draggingSource.group === 'backlog');
  const backlogSliceVisible = (s: ProjectStatusSlice): boolean =>
    s.name === null ||
    s.backlog.length > 0 ||
    (draggingSource?.areaId === s.areaId && draggingSource.group === 'active');

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
          <Group
            title="Active"
            count={activeSlices.reduce((n, s) => n + s.active.length, 0)}
            collapsed={collapsedGroups.has('active')}
            onToggleCollapse={() => onToggleGroup('active')}
          >
            {activeSlices.map((s) => {
              // The dashed empty zone + hint only make sense as a drop
              // affordance; a slice kept visible solely for its tasks
              // rollup stays plain.
              const empty =
                s.active.length === 0 &&
                ((s.name === null && s.backlog.length > 0) ||
                  (draggingSource?.areaId === s.areaId &&
                    draggingSource.group === 'backlog'));
              return (
                <SliceDropZone
                  key={s.areaId}
                  areaId={s.areaId}
                  group="active"
                  empty={empty}
                  className={s.name === null ? undefined : 'subarea-section'}
                  emptyHint="Drag a project here to restore it"
                >
                  {s.header}
                  {s.tasksRollup}
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
        {backlogSlices.length > 0 && (
          <Group
            title="Backlog"
            count={backlogSlices.reduce((n, s) => n + s.backlog.length, 0)}
            collapsed={collapsedGroups.has('backlog')}
            onToggleCollapse={() => onToggleGroup('backlog')}
          >
            {backlogSlices.map((s) => {
              // The viewed area's always-visible Backlog slice keeps
              // the dashed standing drop zone whenever it has no rows.
              const empty =
                s.backlog.length === 0 &&
                (s.name === null ||
                  (draggingSource?.areaId === s.areaId &&
                    draggingSource.group === 'active'));
              return (
                <SliceDropZone
                  key={s.areaId}
                  areaId={s.areaId}
                  group="backlog"
                  empty={empty}
                  className={s.name === null ? undefined : 'subarea-section'}
                  emptyHint="Drag a project here to shelve it"
                >
                  {s.header}
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
