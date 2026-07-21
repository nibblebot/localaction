import { useCallback, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
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

/**
 * Reusable vertical sortable list wired to @dnd-kit.
 *
 * Contract:
 * - `itemIds` is the canonical render order of the list. The caller
 *   must rebuild this list from the store after each `onReorder` so the
 *   next paint reflects the new order.
 * - `onReorder(activeId, beforeId)` is called when a drag completes.
 *   `beforeId` is the id of the row that the dropped item now sits
 *   before; `undefined` means the item moved to the end of the list.
 * - `children` is a render function for each row. It receives the row's
 *   id and a `SortableHandleProps` object the caller must spread onto
 *   the element that should act as the drag handle. Spreading it on
 *   the whole row is the common case (click-and-drag anywhere on the
 *   row); for partial handles (e.g. an icon button) spread only on
 *   the handle element.
 * - `renderOverlay` is an optional render function for the floating
 *   preview that follows the cursor. If omitted, the row is re-rendered
 *   inside the overlay with an inert handle (`sortableOverlayHandle`).
 */
export interface SortableListProps<TId extends string> {
  itemIds: readonly TId[];
  onReorder: (activeId: TId, beforeId: TId | undefined) => void;
  children: (id: TId, handleProps: SortableHandleProps) => ReactNode;
  renderOverlay?: (id: TId) => ReactNode | undefined;
  /**
   * Optional className applied to the wrapping element that contains
   * the list. The placeholder border is rendered between rows; the
   * wrapper itself is invisible.
   */
  className?: string;
  /**
   * Optional label for accessibility — the live region announces
   * "Picked up X" and "Dropped X at position N".
   */
  ariaLabel?: string;
}

export interface SortableHandleProps {
  ref: (el: HTMLElement | null) => void;
  style: CSSProperties;
  attributes: Record<string, unknown>;
  listeners: Record<string, unknown> | undefined;
  isDragging: boolean;
  isOver: boolean;
}

/**
 * Inert handle used to re-render a row inside the DragOverlay when the
 * caller does not supply `renderOverlay`. No listeners/attributes (the
 * preview is non-interactive) and `isDragging: false` so the preview
 * renders at full opacity, without the source row's drag chrome.
 * (Not exported: `react/only-export-components` only allows literal
 * constant exports, so `SortableTree` declares its own copy.)
 */
const sortableOverlayHandle: SortableHandleProps = {
  ref: () => {},
  style: {},
  attributes: {},
  listeners: undefined,
  isDragging: false,
  isOver: false,
};
interface SortableSlotProps<TId extends string> {
  id: TId;
  className?: string;
  children: (handleProps: SortableHandleProps) => ReactNode;
}

function SortableSlot<TId extends string>({
  id,
  className,
  children: render,
}: SortableSlotProps<TId>): ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: id as string });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : undefined,
  };
  const handle: SortableHandleProps = {
    ref: setNodeRef,
    style,
    attributes: attributes as unknown as Record<string, unknown>,
    listeners: listeners as unknown as Record<string, unknown> | undefined,
    isDragging,
    isOver: isOver ?? false,
  };
  return (
    <div
      className={`sortable-item-slot${className ? ` ${className}` : ''}`}
      role="listitem"
    >
      {render(handle)}
    </div>
  );
}

export function SortableList<TId extends string>({
  itemIds,
  onReorder,
  children,
  renderOverlay,
  className,
  ariaLabel,
}: SortableListProps<TId>): ReactElement {
  const [activeId, setActiveId] = useState<TId | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as TId);
  }, []);

  const handleEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;
      const activeIdStr = String(active.id);
      const overIdStr = String(over.id);
      if (activeIdStr === overIdStr) return;
      // The `over` row is the row the cursor is currently above. We
      // translate that into a `beforeId` for the reorder helper. The
      // dragging row is hidden while active, so its original position
      // in the list is a stable reference for "where the gap will
      // land" — when the row is removed, the gap between its
      // neighbours shifts up by one slot.
      const overIdx = itemIds.findIndex((id) => id === overIdStr);
      if (overIdx < 0) return;
      const activeIdx = itemIds.findIndex((id) => id === activeIdStr);
      let beforeId: TId | undefined;
      if (activeIdx < 0 || activeIdx < overIdx) {
        // Active is above (or off-list) the over row; the drop lands
        // between over and the row after it. If the row after over is
        // the active row itself (because active was just above over),
        // skip it and use the one after that.
        const next = itemIds[overIdx + 1] as TId | undefined;
        beforeId = next === activeIdStr
          ? (itemIds[overIdx + 2] as TId | undefined)
          : next;
      } else {
        // Active is below over; the drop lands right before over.
        beforeId = itemIds[overIdx] as TId | undefined;
      }
      onReorder(activeIdStr as TId, beforeId);
    },
    [itemIds, onReorder],
  );

  const handleCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      // Combine pointerWithin (precise when the cursor is over a row)
      // and rectIntersection (covers the gap between rows). The
      // `closestCenter` default confuses the dragged row with the
      // destination when the cursor lands in the dragged row's
      // transformed region, producing self-drops that don't reorder.
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
              : `Dropped ${String(active.id)} outside the list.`,
          onDragCancel: ({ active }) =>
            `Cancelled drag of ${String(active.id)}.`,
        },
        screenReaderInstructions: {
          draggable:
            'To pick up a draggable item, press space or enter. While dragging, use the arrow keys to move the item. Press space or enter again to drop the item in its new position, or press escape to cancel.',
        },
      }}
    >
      <SortableContext items={[...itemIds]} strategy={verticalListSortingStrategy}>
        <div className={className} role="list" aria-label={ariaLabel}>
          {itemIds.map((id) => (
            <SortableSlot key={id} id={id}>
              {(handle) => children(id, handle)}
            </SortableSlot>
          ))}
        </div>
      </SortableContext>
      <DragOverlay className="drag-overlay" dropAnimation={null}>
        {activeId !== null
          ? renderOverlay
            ? renderOverlay(activeId)
            : children(activeId, sortableOverlayHandle)
          : null}
      </DragOverlay>
    </DndContext>
  );
}