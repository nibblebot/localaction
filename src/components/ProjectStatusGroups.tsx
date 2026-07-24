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
 * The project status groups of one area (Active / Backlog / Done)
 * under a single DndContext, so a drag can reorder within a group AND
 * move a project across the Active ⇄ Backlog boundary. Done is
 * derived from task completion — its rows are static and it is never
 * a drop target.
 *
 * - Active and Backlog rows are sortable; each group is also a
 *   droppable container, so a drop on the group header (or an empty /
 *   collapsed group) lands at the end of that group.
 * - A same-group drop reorders (`reorderProject`); a cross-group drop
 *   writes the stored status and the new position in one transaction
 *   (`moveProjectToStatus`).
 * - Active and Backlog are both standing drop destinations: each
 *   renders while the area has any project in either group, even while
 *   empty — shelving or restoring a project must never require
 *   discovering a drop zone that only exists mid-drag.
 *
 * Row rendering stays with the caller (`renderSortableRow` /
 * `renderRow`) so the project-row chrome lives in one place.
 */

type StatusGroupId = 'active' | 'backlog';

/** Droppable container id for a status group. Prefixed so it can
 * never collide with a project id in the same DndContext. */
function containerId(group: StatusGroupId): string {
  return `project-group:${group}`;
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

function StatusGroup({
  group,
  title,
  rollups,
  collapsed,
  onToggleCollapse,
  emptyHint,
  renderSortableRow,
}: {
  group: StatusGroupId;
  title: string;
  rollups: readonly ProjectRollup[];
  collapsed: boolean;
  onToggleCollapse: (id: StatusGroupId) => void;
  /** Hint rendered inside the empty group's drop zone — the group is a
   * standing drop destination, so the zone stays open and labeled. */
  emptyHint?: string;
  renderSortableRow: (p: ProjectRollup, handle: SortableHandleProps) => ReactNode;
}): ReactElement {
  const { setNodeRef, isOver } = useDroppable({
    id: containerId(group),
    data: { group },
  });
  const classes = ['tab-group-droppable'];
  if (isOver) classes.push('tab-group-drop-over');
  if (rollups.length === 0) classes.push('tab-group-empty-zone');
  return (
    <div ref={setNodeRef} className={classes.join(' ')}>
      <Group
        title={title}
        count={rollups.length}
        collapsed={collapsed}
        onToggleCollapse={() => onToggleCollapse(group)}
      >
        <div
          className="sortable-list"
          role="list"
          aria-label={`${title} projects`}
        >
          {rollups.map((p) => (
            <SortableProjectSlot key={p.projectId} id={p.projectId} group={group}>
              {(handle) => renderSortableRow(p, handle)}
            </SortableProjectSlot>
          ))}
        </div>
        {rollups.length === 0 && emptyHint !== undefined && !collapsed && (
          <p className="tab-group-empty-hint">{emptyHint}</p>
        )}
      </Group>
    </div>
  );
}

export default function ProjectStatusGroups({
  active,
  backlog,
  done,
  collapsedGroups,
  onToggleGroup,
  renderSortableRow,
  renderRow,
}: {
  /** The area's visible projects, partitioned and in canonical order. */
  active: readonly ProjectRollup[];
  backlog: readonly ProjectRollup[];
  done: readonly ProjectRollup[];
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

  const activeIds = active.map((p) => p.projectId);
  const backlogIds = backlog.map((p) => p.projectId);

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

      const source: StatusGroupId | undefined = activeIds.includes(dragId)
        ? 'active'
        : backlogIds.includes(dragId)
          ? 'backlog'
          : undefined;
      if (!source) return;

      let target: StatusGroupId;
      let beforeId: string | undefined;
      if (overId === containerId('active') || overId === containerId('backlog')) {
        // Drop on the group header / empty group → end of that group.
        target = overId === containerId('active') ? 'active' : 'backlog';
        beforeId = undefined;
      } else {
        target = activeIds.includes(overId)
          ? 'active'
          : backlogIds.includes(overId)
            ? 'backlog'
            : source;
        if (target === source) {
          // Same gap translation as SortableList: the hidden dragging
          // row keeps its slot, so the landing gap shifts by one when
          // moving down past the row it sat above.
          const ids = source === 'active' ? activeIds : backlogIds;
          const overIdx = ids.indexOf(overId);
          const activeIdx = ids.indexOf(dragId);
          if (activeIdx < 0 || activeIdx < overIdx) {
            const next = ids[overIdx + 1];
            beforeId = next === dragId ? ids[overIdx + 2] : next;
          } else {
            beforeId = ids[overIdx];
          }
        } else {
          // Cross-group: the drop lands right before the `over` row.
          beforeId = overId;
        }
      }

      if (target === source) {
        if (beforeId === dragId) return;
        reorderProject(store, dragId, beforeId);
      } else {
        moveProjectToStatus(store, dragId, STATUS_FOR_GROUP[target], beforeId);
      }
    },
    [store, activeIds, backlogIds],
  );

  const handleCancel = useCallback(() => {
    setDraggingId(null);
  }, []);

  const draggingSource: StatusGroupId | null =
    draggingId === null
      ? null
      : activeIds.includes(draggingId)
        ? 'active'
        : 'backlog';
  // Both sortable groups are standing drop destinations: each renders
  // while the area has any project in either group, even while empty,
  // so shelving or restoring never requires discovering a target that
  // only exists mid-drag. With no Active or Backlog projects at all
  // (fresh area, or everything Done) neither renders.
  const activeVisible =
    active.length > 0 || backlog.length > 0 || draggingSource === 'backlog';
  const backlogVisible =
    active.length > 0 || backlog.length > 0 || draggingSource === 'active';
  const draggingRollup =
    active.find((p) => p.projectId === draggingId) ??
    backlog.find((p) => p.projectId === draggingId);

  return (
    <DndContext
      sensors={sensors}
      // pointerWithin is precise over a row (and required for the
      // group-container drop targets); rectIntersection covers the
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
      <SortableContext
        items={[...activeIds, ...backlogIds]}
        strategy={verticalListSortingStrategy}
      >
        {activeVisible && (
          <StatusGroup
            group="active"
            title="Active"
            rollups={active}
            collapsed={collapsedGroups.has('active')}
            onToggleCollapse={onToggleGroup}
            emptyHint="Drag a project here to restore it"
            renderSortableRow={renderSortableRow}
          />
        )}
        {backlogVisible && (
          <StatusGroup
            group="backlog"
            title="Backlog"
            rollups={backlog}
            collapsed={collapsedGroups.has('backlog')}
            onToggleCollapse={onToggleGroup}
            emptyHint="Drag a project here to shelve it"
            renderSortableRow={renderSortableRow}
          />
        )}
      </SortableContext>
      {done.length > 0 && (
        <Group
          title="Done"
          count={done.length}
          collapsed={collapsedGroups.has('done')}
          onToggleCollapse={() => onToggleGroup('done')}
        >
          {done.map((p) => renderRow(p))}
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
