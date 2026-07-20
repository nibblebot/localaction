import { useCallback, useMemo, useState } from 'react';
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
import type {
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SortableHandleProps } from './SortableList.tsx';

/**
 * Inert handle used to re-render a row inside the DragOverlay when the
 * caller does not supply `renderOverlay`. Identical to the one in
 * `SortableList.tsx` — duplicated (not shared) because
 * `react/only-export-components` only allows literal constant exports.
 */
const sortableOverlayHandle: SortableHandleProps = {
  ref: () => {},
  style: {},
  attributes: {},
  listeners: undefined,
  isDragging: false,
  isOver: false,
};

/**
 * Flattened-tree sortable list (dnd-kit tree pattern) — one DndContext
 * spans the whole tree, so a drag can reorder within a sibling group
 * AND reparent across groups. Sibling-only callers should keep using
 * `SortableList`.
 *
 * Model: the caller owns the tree as nested `SortableTreeNode`s in
 * canonical render order. The component flattens it depth-first, makes
 * every visible row a sortable in one list, and derives drop intent
 * from pointer position: vertical movement picks the insertion row,
 * horizontal movement (right = nest, left = unnest) picks the depth.
 *
 * Contract:
 * - `nodes` is the canonical render order of the tree. The caller must
 *   rebuild it from the store after each `onMove` so the next paint
 *   reflects the move. To hide a subtree (e.g. a collapsed parent),
 *   pass the node with `children: []` — hidden rows can't be drop
 *   targets.
 * - `onMove(activeId, newParentId, beforeId)` fires when a drag
 *   completes with an actual change (drops that reproduce the current
 *   position are suppressed). `newParentId` is the id of the new
 *   parent (`null` = root level of this tree); `beforeId` is the id
 *   of the sibling the moved row now sits before within that parent,
 *   `undefined` = last child. While dragging, a row's whole subtree
 *   moves with it and its descendants drop out of the target list, so
 *   a row can never be dropped into itself.
 * - `children` is a render function per row: `(id, handleProps, depth)`.
 *   Spread `handleProps` like `SortableList`. `depth` is the row's
 *   current nesting depth (0 = root); indentation is applied by the
 *   slot wrapper (`depth * indentWidth` px of left padding).
 * - `renderOverlay` optionally renders the floating preview; it
 *   receives the projected (target) depth so the preview can indent
 *   to match where the drop will land. If omitted, the row is
 *   re-rendered inside the overlay with an inert handle, indented
 *   to the projected depth.
 * - `maxDepth` clamps how deep a row may be nested (e.g. 1 for a
 *   two-level tree). Depth can never exceed "previous row's depth + 1",
 *   so no level is ever skipped.
 *
 * Keyboard drags reorder vertically only; depth changes are
 * pointer-driven.
 */
export interface SortableTreeNode<TId extends string> {
  id: TId;
  children: readonly SortableTreeNode<TId>[];
}

export interface SortableTreeProps<TId extends string> {
  nodes: readonly SortableTreeNode<TId>[];
  onMove: (activeId: TId, newParentId: TId | null, beforeId: TId | undefined) => void;
  children: (id: TId, handleProps: SortableHandleProps, depth: number) => ReactNode;
  renderOverlay?: (id: TId, depth: number) => ReactNode | undefined;
  /** Horizontal px per depth level — drives indent + projection. */
  indentWidth?: number;
  /** Deepest allowed nesting; default unbounded. */
  maxDepth?: number;
  /**
   * Per-row override of `maxDepth`, keyed by the DRAGGED row's id.
   * Use it to pin certain rows to a fixed level (e.g. 0 keeps section
   * headers from nesting under tasks) while leaving others unbounded.
   */
  maxDepthOf?: (id: TId) => number;
  className?: string;
  ariaLabel?: string;
}

interface FlattenedItem<TId extends string> {
  id: TId;
  parentId: TId | null;
  depth: number;
}

function flattenTree<TId extends string>(
  nodes: readonly SortableTreeNode<TId>[],
): FlattenedItem<TId>[] {
  const out: FlattenedItem<TId>[] = [];
  const walk = (
    ns: readonly SortableTreeNode<TId>[],
    parentId: TId | null,
    depth: number,
  ): void => {
    for (const n of ns) {
      out.push({ id: n.id, parentId, depth });
      walk(n.children, n.id, depth + 1);
    }
  };
  walk(nodes, null, 0);
  return out;
}

/** `items` minus the descendants of `rootId` (the row itself stays). */
function removeSubtree<TId extends string>(
  items: readonly FlattenedItem<TId>[],
  rootId: TId,
): FlattenedItem<TId>[] {
  const excluded = new Set<TId>([rootId]);
  return items.filter((item) => {
    if (item.parentId !== null && excluded.has(item.parentId)) {
      excluded.add(item.id);
      return false;
    }
    return true;
  });
}

interface Projection<TId extends string> {
  parentId: TId | null;
  beforeId: TId | undefined;
  depth: number;
}

/**
 * Resolve a drag position into a concrete (parent, before) drop.
 * `items` is the flattened list as rendered during the drag (active
 * subtree removed); `overId` is the row under the cursor; `offsetX`
 * the cumulative horizontal drag distance. Returns null when the
 * coordinates don't resolve to a valid position.
 */
function getProjection<TId extends string>(
  items: readonly FlattenedItem<TId>[],
  activeId: TId,
  overId: TId,
  offsetX: number,
  indentWidth: number,
  maxDepthLimit: number,
): Projection<TId> | null {
  const overIndex = items.findIndex((i) => i.id === overId);
  const activeIndex = items.findIndex((i) => i.id === activeId);
  if (overIndex < 0 || activeIndex < 0) return null;
  const activeItem = items[activeIndex]!;

  // Where the row will sit once dropped.
  const newItems = arrayMove([...items], activeIndex, overIndex);
  const previousItem = newItems[overIndex - 1] as FlattenedItem<TId> | undefined;
  const nextItem = newItems[overIndex + 1] as FlattenedItem<TId> | undefined;

  // Projected depth: own depth + horizontal drag, clamped so the row
  // nests at most one level past the row above it and never shallower
  // than the row below it.
  const projectedDepth = activeItem.depth + Math.round(offsetX / indentWidth);
  const maxDepth = Math.min(
    previousItem ? previousItem.depth + 1 : 0,
    maxDepthLimit,
  );
  const minDepth = nextItem ? nextItem.depth : 0;
  let depth = projectedDepth;
  if (depth >= maxDepth) depth = maxDepth;
  if (depth < minDepth) depth = minDepth;
  // A shallow neighbour below can push `minDepth` past the caller's
  // depth limit — the limit always wins.
  if (depth > maxDepth) depth = maxDepth;

  let parentId: TId | null;
  if (depth === 0 || !previousItem) {
    parentId = null;
  } else if (depth === previousItem.depth) {
    parentId = previousItem.parentId;
  } else if (depth > previousItem.depth) {
    parentId = previousItem.id;
  } else {
    // Shallower than the row above: adopt the parent of the nearest
    // preceding row at the target depth.
    parentId =
      newItems
        .slice(0, overIndex)
        .reverse()
        .find((i) => i.depth === depth)?.parentId ?? null;
  }

  // The sibling the dropped row will sit before: the first row after
  // the drop position at the same depth under the same parent. A
  // shallower row ends the sibling group (drop = last child).
  let beforeId: TId | undefined;
  for (let i = overIndex + 1; i < newItems.length; i += 1) {
    const it = newItems[i]!;
    if (it.depth < depth) break;
    if (it.depth === depth && it.parentId === parentId) {
      beforeId = it.id;
      break;
    }
  }
  return { parentId, beforeId, depth };
}

/**
 * The position `activeId` currently occupies in the full (undragged)
 * flattened list, in the same (parentId, beforeId) shape as a
 * Projection — used to suppress no-op drops.
 */
function currentPosition<TId extends string>(
  items: readonly FlattenedItem<TId>[],
  activeId: TId,
): { parentId: TId | null; beforeId: TId | undefined } | null {
  const activeIndex = items.findIndex((i) => i.id === activeId);
  if (activeIndex < 0) return null;
  const activeItem = items[activeIndex]!;
  let j = activeIndex + 1;
  while (j < items.length && items[j]!.depth > activeItem.depth) j += 1;
  let beforeId: TId | undefined;
  for (let k = j; k < items.length; k += 1) {
    const it = items[k]!;
    if (it.depth < activeItem.depth) break;
    if (it.depth === activeItem.depth && it.parentId === activeItem.parentId) {
      beforeId = it.id;
      break;
    }
  }
  return { parentId: activeItem.parentId, beforeId };
}

interface SortableTreeSlotProps<TId extends string> {
  id: TId;
  depth: number;
  indentWidth: number;
  children: (handleProps: SortableHandleProps, depth: number) => ReactNode;
}

function SortableTreeSlot<TId extends string>({
  id,
  depth,
  indentWidth,
  children: render,
}: SortableTreeSlotProps<TId>): ReactElement {
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
      className="sortable-item-slot"
      style={depth > 0 ? { paddingLeft: depth * indentWidth } : undefined}
    >
      {render(handle, depth)}
    </div>
  );
}

export function SortableTree<TId extends string>({
  nodes,
  onMove,
  children,
  renderOverlay,
  indentWidth = 24,
  maxDepth = Number.POSITIVE_INFINITY,
  maxDepthOf,
  className,
  ariaLabel,
}: SortableTreeProps<TId>): ReactElement {
  const [activeId, setActiveId] = useState<TId | null>(null);
  const [overId, setOverId] = useState<TId | null>(null);
  const [offsetX, setOffsetX] = useState(0);

  const flattened = useMemo(() => flattenTree(nodes), [nodes]);
  // During a drag the active row's descendants leave the target list:
  // the subtree moves with the parent and can't be its own drop target.
  const rendered = useMemo(
    () => (activeId === null ? flattened : removeSubtree(flattened, activeId)),
    [flattened, activeId],
  );

  // Depth limit for the row currently being dragged.
  const activeMaxDepth =
    activeId !== null && maxDepthOf ? maxDepthOf(activeId) : maxDepth;

  const projected =
    activeId !== null && overId !== null
      ? getProjection(rendered, activeId, overId, offsetX, indentWidth, activeMaxDepth)
      : null;

  // Depth used by the overlay: where the drop will land, else the row's
  // current depth — same value the `renderOverlay` path receives.
  const activeDepth =
    activeId === null
      ? 0
      : (projected?.depth ?? flattened.find((i) => i.id === activeId)?.depth ?? 0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reset = useCallback(() => {
    setActiveId(null);
    setOverId(null);
    setOffsetX(0);
  }, []);

  const handleStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as TId);
    setOverId(event.active.id as TId);
    setOffsetX(0);
  }, []);

  const handleMove = useCallback((event: DragMoveEvent) => {
    setOffsetX(event.delta.x);
  }, []);

  const handleOver = useCallback((event: DragOverEvent) => {
    setOverId((event.over?.id as TId | undefined) ?? null);
  }, []);

  const handleEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over, delta } = event;
      reset();
      if (!over) return;
      const activeIdStr = String(active.id) as TId;
      const overIdStr = String(over.id) as TId;
      // Recompute against the drag-time list (subtree removed) with the
      // final pointer offsets.
      const dragItems = removeSubtree(flattened, activeIdStr);
      const projection = getProjection(
        dragItems,
        activeIdStr,
        overIdStr,
        delta.x,
        indentWidth,
        maxDepthOf ? maxDepthOf(activeIdStr) : maxDepth,
      );
      if (!projection) return;
      const current = currentPosition(flattened, activeIdStr);
      if (
        current &&
        current.parentId === projection.parentId &&
        current.beforeId === projection.beforeId
      ) {
        return;
      }
      onMove(activeIdStr, projection.parentId, projection.beforeId);
    },
    [flattened, indentWidth, maxDepth, maxDepthOf, onMove, reset],
  );

  return (
    <DndContext
      sensors={sensors}
      // pointerWithin is precise over a row; rectIntersection covers
      // the gaps between rows (same rationale as SortableList).
      collisionDetection={(args) => {
        const pointerCollisions = pointerWithin(args);
        if (pointerCollisions.length > 0) return pointerCollisions;
        return rectIntersection(args);
      }}
      onDragStart={handleStart}
      onDragMove={handleMove}
      onDragOver={handleOver}
      onDragEnd={handleEnd}
      onDragCancel={reset}
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
              : `Dropped ${String(active.id)} outside the tree.`,
          onDragCancel: ({ active }) =>
            `Cancelled drag of ${String(active.id)}.`,
        },
        screenReaderInstructions: {
          draggable:
            'To pick up a draggable item, press space or enter. While dragging, use the arrow keys to move the item. Press space or enter again to drop the item in its new position, or press escape to cancel.',
        },
      }}
    >
      <SortableContext
        items={rendered.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={className} role="list" aria-label={ariaLabel}>
          {rendered.map((item) => (
            <SortableTreeSlot
              key={item.id}
              id={item.id}
              depth={item.depth}
              indentWidth={indentWidth}
            >
              {(handle, depth) => children(item.id, handle, depth)}
            </SortableTreeSlot>
          ))}
        </div>
      </SortableContext>
      <DragOverlay className="drag-overlay" dropAnimation={null}>
        {activeId !== null ? (
          renderOverlay ? (
            renderOverlay(activeId, activeDepth)
          ) : (
            <div
              style={
                activeDepth > 0 ? { paddingLeft: activeDepth * indentWidth } : undefined
              }
            >
              {children(activeId, sortableOverlayHandle, activeDepth)}
            </div>
          )
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
