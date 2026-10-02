import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import {
  TABLES,
  PLACEMENT_SEP,
  getRawPlacement,
  moveTask,
  useDataLayer,
  useTask,
  useArea,
} from '../../data/index.ts';
import { areaColorHex } from '../../data/colors.ts';
import { resolveSidebarAreaDrop } from './sidebarAreaDrop.ts';

/** Placement prefix shared by every area-rooted task. */
const AREA_PREFIX = `area${PLACEMENT_SEP}`;

/**
 * The shell-level DndContext: ONE context spans the sidebar's area tree
 * and the main pane's task trees (the inbox / area views), so a task row
 * dragged from the pane can be dropped onto an area / subarea row in the
 * sidebar.
 *
 * Pane-internal and sidebar-internal drops still resolve in the
 * participants' own monitors (registered into this context via
 * ContextDndMonitor / ExternalTreeMonitor): a tree's same-row drops
 * resolve through `getProjection` — which returns null when the active
 * id isn't one of the tree's rows, so a task hovered over an area row is
 * a safe no-op there — and RootGroups' group/header drops resolve via
 * `resolveTaskGroupDrop`, whose `findPosition` guards return null for
 * area-row and area-drag ids. Cross-type drags are therefore no-ops in
 * every other participant.
 *
 * This level resolves ONLY the task→area-row pairing, via
 * `resolveSidebarAreaDrop`: a task dropped on a sidebar area row moves
 * to the end of that area's root list (`moveTask`, `beforeId` undefined);
 * a drop that wouldn't change the task's direct placement resolves to a
 * no-op. The single DragOverlay here previews the dragged task row or
 * area row — external-mode trees skip their own overlays, so exactly one
 * preview renders for any drag.
 */
export function ShellDndContext({ children }: { children: ReactNode }): React.JSX.Element {
  const { store } = useDataLayer();
  const [activeId, setActiveId] = useState<string | null>(null);

  const handleStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);
  const handleCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const handleEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const dragId = String(event.active.id);
      const areaId = resolveSidebarAreaDrop(
        dragId,
        event.over ? String(event.over.id) : null,
        (id) => store.hasRow(TABLES.tasks, id),
        (id) => store.hasRow(TABLES.areas, id),
        (taskId) => {
          const placement = getRawPlacement(store, taskId);
          if (placement === null || !placement.startsWith(AREA_PREFIX)) return null;
          return placement.slice(AREA_PREFIX.length) || null;
        },
      );
      if (areaId === null) return;
      moveTask(store, dragId, `area${PLACEMENT_SEP}${areaId}`, undefined);
    },
    [store],
  );

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Exactly one overlay preview: the dragged task row, else the dragged
  // area row, else nothing (group droppable ids can never be active).
  let overlay: ReactNode = null;
  if (activeId !== null) {
    if (store.hasRow(TABLES.tasks, activeId)) {
      overlay = <OverlayTaskRow taskId={activeId} />;
    } else if (store.hasRow(TABLES.areas, activeId)) {
      overlay = <OverlayAreaRow areaId={activeId} />;
    }
  }

  return (
    <DndContext
      sensors={sensors}
      // pointerWithin is precise over a row; rectIntersection covers
      // the gaps between rows and the drop zones (same rationale as
      // SortableTree / SortableList).
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
          onDragStart: ({ active }) => `Picked up ${String(active.id)}.`,
          onDragOver: ({ active, over }) =>
            over
              ? `${String(active.id)} is over ${String(over.id)}.`
              : `${String(active.id)} is no longer over a droppable.`,
          onDragEnd: ({ active, over }) =>
            over
              ? `Dropped ${String(active.id)} on ${String(over.id)}.`
              : `Dropped ${String(active.id)} outside any target.`,
          onDragCancel: ({ active }) => `Cancelled drag of ${String(active.id)}.`,
        },
        screenReaderInstructions: {
          draggable:
            'To pick up a draggable item, press space or enter. While dragging, use the arrow keys to move the item. Press space or enter again to drop the item in its new position, or press escape to cancel.',
        },
      }}
    >
      {children}
      <DragOverlay className="drag-overlay" dropAnimation={null}>
        {overlay}
      </DragOverlay>
    </DndContext>
  );
}

/** Inert single-line preview of the dragged root task (moved here from
 * RootGroups: the shell context owns the pane's overlay preview). */
function OverlayTaskRow({ taskId }: { taskId: string }): React.JSX.Element | null {
  const { store } = useDataLayer();
  const task = useTask(store, taskId);
  if (!task) return null;
  return (
    <div className="task-line task-line-dragging">
      <textarea
        className="task-line-title"
        aria-label="Task title"
        rows={1}
        readOnly
        value={task.title || 'Untitled'}
      />
    </div>
  );
}

/** Inert sidebar-row-style preview of the dragged area (the sidebar
 * tree is external-mode and renders no overlay of its own). */
function OverlayAreaRow({ areaId }: { areaId: string }): React.JSX.Element | null {
  const { store } = useDataLayer();
  const area = useArea(store, areaId);
  if (!area) return null;
  return (
    <div className="sidebar-area-row sortable-row">
      <div className="sidebar-item-row">
        <div className="sidebar-item sidebar-item-drag-handle">
          <span
            className="sidebar-item-dot"
            style={{ background: areaColorHex(area.color) }}
            aria-hidden="true"
          />
          <span className="sidebar-item-name">{area.name || 'Untitled'}</span>
        </div>
      </div>
    </div>
  );
}
