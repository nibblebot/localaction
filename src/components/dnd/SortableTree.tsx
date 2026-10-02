import { useCallback, useMemo, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDndMonitor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragMoveEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SortableHandleProps } from './SortableList.tsx';
import { DndTargetContext } from './dndTarget.ts';
import type { DndTarget } from './dndTarget.ts';

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
 * Forwards the enclosing DndContext's monitor events to the given
 * callbacks without rendering anything. Place it INSIDE a tree's
 * DndContext (anywhere in its children) to observe the drag lifecycle
 * of that tree from an outer component — e.g. to track the dragged
 * row's id for gating outer drop targets. Renders null.
 */
export function ContextDndMonitor({
  onDragStart,
  onDragOver,
  onDragEnd,
  onDragCancel,
}: {
  onDragStart?: (event: DragStartEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragCancel?: () => void;
}): null {
  useDndMonitor({
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  });
  return null;
}

/**
 * External-mode monitor: subscribes to the ENCLOSING DndContext and
 * feeds this tree's local projection handlers, so a tree registered
 * into a hoisted context still computes its own (parent, before)
 * drop. Only mounted when `externalDndContext` is set — the hook
 * throws outside a DndContext, and standalone trees (TaskPane) never
 * mount it.
 */
function ExternalTreeMonitor({
  onDragStart,
  onDragMove,
  onDragOver,
  onDragEnd,
  onDragCancel,
}: {
  onDragStart: (event: DragStartEvent) => void;
  onDragMove: (event: DragMoveEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onDragCancel: () => void;
}): null {
  useDndMonitor({
    onDragStart,
    onDragMove,
    onDragOver,
    onDragEnd,
    onDragCancel,
  });
  return null;
}

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
 * - `isPhantom` marks rows that group their children visually WITHOUT
 *   contributing an indent level: a phantom row renders at its own
 *   depth, but its children render at that same depth (flush with it)
 *   and its column never appears in their tree gutters. Grandchildren
 *   indent one step from the phantom's children as usual. Only the
 *   rendering depth shifts — logical depth (drag projection, drop
 *   parent resolution, `maxDepth`) is untouched, so drop semantics
 *   are identical with or without phantoms.
 * - `isStatic` marks rows that render through the slot like any other
 *   (indent, gutters, render fn) but are invisible to drag-and-drop:
 *   their `useSortable` is disabled and they are excluded from the
 *   SortableContext items and from every list fed to projection,
 *   no-op detection, and drop resolution. A static row can never be
 *   `activeId`/`overId`, so `onMove` never sees its id. Task trees
 *   use this for the pending draft row (see hooks/taskDraft.ts).
 * - Dropping a row onto one of its own ancestor rows (an easy
 *   overshoot when dragging up, since the parent row sits directly
 *   above the first sibling) keeps it in the family as the ancestor's
 *   first child. Ejecting the row to the level above the ancestor
 *   requires an intentional horizontal drag left — vertical movement
 *   alone never detaches a row from its group.
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
  /**
   * Per-row predicate marking rows whose children render flush with
   * the row itself instead of one indent level in (see the contract
   * above). Grouped rows use this so their tasks
   * align with the section header while subtasks keep the gutter.
   */
  isPhantom?: (id: TId) => boolean;
  /**
   * Per-row predicate marking rows that render normally through the
   * slot but are excluded from drag-and-drop entirely: disabled
   * sortable, absent from SortableContext items and from every
   * projection/drop list. The render loop still walks them.
   */
  isStatic?: (id: TId) => boolean;
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
  /**
   * Register this tree's rows into the ENCLOSING DndContext instead of
   * owning one. The enclosing context resolves drops: this tree
   * observes it (useDndMonitor) and fires `onMove` for tree-level
   * drops only when the enclosing context passes events through. Set
   * when a hoisted context coordinates this tree plus group drop
   * targets (RootGroups); leave unset for standalone trees (TaskPane).
   */
  externalDndContext?: boolean;
}

interface FlattenedItem<TId extends string> {
  id: TId;
  parentId: TId | null;
  /** Logical nesting depth — drives drag projection and drop parent
   * resolution. Never shifted by phantom rows. */
  depth: number;
  /** Render depth: `depth` minus one per phantom ancestor. Drives the
   * slot's indent and the tree-gutter columns. */
  visualDepth: number;
  /**
   * Ancestor columns painted as full-height verticals on this row.
   * The row's own column (`visualDepth`) is NOT in this set — the
   * dedicated `.tree-branch` span paints it with full or half
   * height depending on `isLastSibling`.
   */
  continues: readonly number[];
  /** Column for the row's own branch connector. -1 at visual depth 0. */
  parentCol: number;
  /** True when this row is the last sibling under its parent. */
  isLastSibling: boolean;
}
function flattenTree<TId extends string>(
  nodes: readonly SortableTreeNode<TId>[],
  isPhantom?: (id: TId) => boolean,
): FlattenedItem<TId>[] {
  const out: FlattenedItem<TId>[] = [];
  const walk = (
    ns: readonly SortableTreeNode<TId>[],
    parentId: TId | null,
    depth: number,
    visualDepth: number,
    /** Ancestor columns still descending through the parent. */
    inherited: readonly number[],
  ): void => {
    for (let i = 0; i < ns.length; i += 1) {
      const n = ns[i]!;
      const isLast = i === ns.length - 1;
      const parentCol = visualDepth > 0 ? visualDepth - 1 : -1;
      const continues = inherited;
      // Descendants see this row's own column iff the row has a
      // sibling below it. Depth-0 rows never push (no parent column),
      // so a root-level group's gutter terminates at the last task
      // inside it. Phantom rows have no column of their own, so they
      // push nothing either way.
      const passDown = !isLast && parentCol >= 0 ? [...inherited, parentCol] : inherited;
      out.push({
        id: n.id,
        parentId,
        depth,
        visualDepth,
        continues,
        parentCol,
        isLastSibling: visualDepth > 0 && isLast,
      });
      // Phantom rows group their children without an indent level:
      // the children walk at the phantom's own visual depth.
      const childVisual = isPhantom?.(n.id) === true ? visualDepth : visualDepth + 1;
      walk(n.children, n.id, depth + 1, childVisual, passDown);
    }
  };
  walk(nodes, null, 0, 0, []);
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
  const overItem = items[overIndex]!;

  // Projected depth: own depth + horizontal drag, clamped below so the
  // row nests at most one level past the row above it and never
  // shallower than the row below it.
  const projectedDepth = activeItem.depth + Math.round(offsetX / indentWidth);

  // Dragging a row UP over one of its own ancestors is an overshoot
  // inside the same group — the parent row sits directly above the
  // first sibling, so aiming for the top of the group easily lands on
  // it. Interpret the drop as "first child of that ancestor": the
  // clamping below would otherwise eject the row to the level ABOVE
  // the ancestor. An intentional horizontal drag left (projected depth
  // shallower than the ancestor's child level) keeps the old meaning:
  // drop before the ancestor.
  let dropIndex = overIndex;
  if (projectedDepth >= overItem.depth + 1) {
    for (let cur = activeItem.parentId; cur !== null;) {
      if (cur === overId) {
        dropIndex = overIndex + 1;
        break;
      }
      cur = items.find((i) => i.id === cur)?.parentId ?? null;
    }
  }

  // Where the row will sit once dropped.
  const newItems = arrayMove([...items], activeIndex, dropIndex);
  const previousItem = newItems[dropIndex - 1] as FlattenedItem<TId> | undefined;
  const nextItem = newItems[dropIndex + 1] as FlattenedItem<TId> | undefined;

  const maxDepth = Math.min(previousItem ? previousItem.depth + 1 : 0, maxDepthLimit);
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
        .slice(0, dropIndex)
        .reverse()
        .find((i) => i.depth === depth)?.parentId ?? null;
  }

  // The sibling the dropped row will sit before: the first row after
  // the drop position at the same depth under the same parent. A
  // shallower row ends the sibling group (drop = last child).
  let beforeId: TId | undefined;
  for (let i = dropIndex + 1; i < newItems.length; i += 1) {
    const it = newItems[i]!;
    if (it.depth < depth) break;
    if (it.depth === depth && it.parentId === parentId) {
      beforeId = it.id;
      break;
    }
  }

  // A root-pinned row (maxDepth 0, e.g. a pinned header) dropped over
  // a row nested inside a trailing subtree finds no root sibling after
  // the drop point, so the scan above misreads the drop as "end of the
  // root list". When the dragged row came from BELOW the block the
  // pointer is in, the intended boundary is the TOP of that block —
  // resolve beforeId to the over row's root ancestor. (Coming from
  // above, "end of the root list" is already the right landing.)
  if (beforeId === undefined && maxDepthLimit === 0 && depth === 0 && overId !== activeId) {
    let root = overItem;
    while (root.parentId !== null) {
      const parent = items.find((i) => i.id === root.parentId);
      if (!parent) break;
      root = parent;
    }
    if (root.id !== activeId && activeIndex > items.indexOf(root)) {
      beforeId = root.id;
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
  /** Render depth (logical depth minus phantom ancestors) — drives
   * the slot indent and gutter columns. */
  visualDepth: number;
  indentWidth: number;
  /** Ancestor columns painted full-height on this row's gutter. */
  continues: readonly number[];
  /** Column for the row's own branch connector. -1 at depth 0. */
  parentCol: number;
  /** True when the row's own branch is the last-sibling (top-half). */
  isLastSibling: boolean;
  /** Static rows render through the slot but never drag or drop. */
  disabled?: boolean;
  children: (handleProps: SortableHandleProps, depth: number) => ReactNode;
}

function SortableTreeSlot<TId extends string>({
  id,
  depth,
  visualDepth,
  indentWidth,
  continues,
  parentCol,
  isLastSibling,
  disabled = false,
  children: render,
}: SortableTreeSlotProps<TId>): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } =
    useSortable({ id: id as string, disabled });
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
      role="listitem"
      data-depth={visualDepth}
      data-last-sibling={isLastSibling ? 'true' : undefined}
      style={
        visualDepth > 0
          ? ({
              paddingLeft: visualDepth * indentWidth,
              '--tree-gutter-width': `${visualDepth * indentWidth}px`,
              '--tree-indent-width': `${indentWidth}px`,
            } as CSSProperties)
          : undefined
      }
    >
      {continues.map((col) => (
        <span
          key={`c${col}`}
          className="tree-line"
          style={{ '--tree-column': col } as CSSProperties}
          aria-hidden="true"
        />
      ))}
      {parentCol >= 0 && (
        <span
          className={`tree-branch${isLastSibling ? ' tree-branch-last' : ''}`}
          style={{ '--tree-column': parentCol } as CSSProperties}
          aria-hidden="true"
        />
      )}
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
  isPhantom,
  isStatic,
  className,
  ariaLabel,
  externalDndContext = false,
}: SortableTreeProps<TId>): ReactElement {
  const [activeId, setActiveId] = useState<TId | null>(null);
  const [overId, setOverId] = useState<TId | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  // A non-owning tree registers its rows into the ENCLOSING DndContext
  // instead of owning one (RootGroups' hoisted group drops). Decided at
  // mount — never flips mid-drag. Standalone trees (TaskPane) own their
  // context exactly as before.
  const isExternal = externalDndContext;

  // Live drag state published to outer contexts (see DndTargetContext).
  const dndTarget = useMemo<DndTarget>(
    () => ({
      activeId: activeId as string | null,
      overId: overId as string | null,
    }),
    [activeId, overId],
  );

  const flattened = useMemo(() => flattenTree(nodes, isPhantom), [nodes, isPhantom]);
  // Static rows render but are invisible to drag-and-drop: every list
  // the DnD logic consumes (context items, projection, no-op check,
  // drop resolution) is built from `draggable` instead of `flattened`.
  const draggable = useMemo(
    () => (isStatic ? flattened.filter((i) => !isStatic(i.id)) : flattened),
    [flattened, isStatic],
  );
  // During a drag the active row's descendants leave the target list:
  // the subtree moves with the parent and can't be its own drop target.
  const rendered = useMemo(
    () => (activeId === null ? flattened : removeSubtree(flattened, activeId)),
    [flattened, activeId],
  );
  const renderedDraggable = useMemo(
    () => (activeId === null ? draggable : removeSubtree(draggable, activeId)),
    [draggable, activeId],
  );

  // Depth limit for the row currently being dragged.
  const activeMaxDepth = activeId !== null && maxDepthOf ? maxDepthOf(activeId) : maxDepth;

  const projected =
    activeId !== null && overId !== null
      ? getProjection(renderedDraggable, activeId, overId, offsetX, indentWidth, activeMaxDepth)
      : null;

  // Depth used by the overlay: where the drop will land, else the row's
  // current depth — same value the `renderOverlay` path receives.
  const activeDepth =
    activeId === null
      ? 0
      : (projected?.depth ?? flattened.find((i) => i.id === activeId)?.depth ?? 0);

  // Phantom ancestors of the row's (projected) parent — the amount the
  // render depth shifts below the logical one.
  const phantomCountOf = (parentId: TId | null): number => {
    if (parentId === null || !isPhantom) return 0;
    const parent = flattened.find((i) => i.id === parentId);
    if (!parent) return 0;
    return parent.depth - parent.visualDepth + (isPhantom(parent.id) ? 1 : 0);
  };
  // Visual counterpart of `activeDepth`: indents the overlay preview so
  // it matches where the drop will land on screen.
  const activeVisualDepth =
    activeId === null
      ? 0
      : projected
        ? projected.depth - phantomCountOf(projected.parentId)
        : (flattened.find((i) => i.id === activeId)?.visualDepth ?? 0);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
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
      // External mode: the enclosing context resolves cross-tree and
      // group-level drops; this tree only handles drops onto its own
      // rows (same-slice reorder/nest). Anything else is the hoisted
      // context's job.
      if (isExternal && !draggable.some((i) => i.id === overIdStr)) return;
      // Recompute against the drag-time list (subtree removed) with the
      // final pointer offsets. Static rows never participate in drops.
      const dragItems = removeSubtree(draggable, activeIdStr);
      const projection = getProjection(
        dragItems,
        activeIdStr,
        overIdStr,
        delta.x,
        indentWidth,
        maxDepthOf ? maxDepthOf(activeIdStr) : maxDepth,
      );
      if (!projection) return;
      const current = currentPosition(draggable, activeIdStr);
      if (
        current &&
        current.parentId === projection.parentId &&
        current.beforeId === projection.beforeId
      ) {
        return;
      }
      onMove(activeIdStr, projection.parentId, projection.beforeId);
    },
    [draggable, indentWidth, maxDepth, maxDepthOf, onMove, reset, isExternal],
  );

  // The rows + drag overlay, shared by both render modes. In external
  // mode the overlay is skipped — the enclosing context owns it.
  const treeBody = (
    <DndTargetContext.Provider value={dndTarget}>
      <SortableContext
        items={renderedDraggable.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className={className} role="list" aria-label={ariaLabel}>
          {rendered.map((item) => (
            <SortableTreeSlot
              key={item.id}
              id={item.id}
              depth={item.depth}
              visualDepth={item.visualDepth}
              indentWidth={indentWidth}
              continues={item.continues}
              parentCol={item.parentCol}
              isLastSibling={item.isLastSibling}
              disabled={isStatic?.(item.id) ?? false}
            >
              {(handle, depth) => children(item.id, handle, depth)}
            </SortableTreeSlot>
          ))}
        </div>
      </SortableContext>
      {!isExternal && (
        <DragOverlay className="drag-overlay" dropAnimation={null}>
          {activeId !== null ? (
            renderOverlay ? (
              renderOverlay(activeId, activeDepth)
            ) : (
              <div
                style={
                  activeVisualDepth > 0
                    ? { paddingLeft: activeVisualDepth * indentWidth }
                    : undefined
                }
              >
                {children(activeId, sortableOverlayHandle, activeDepth)}
              </div>
            )
          ) : null}
        </DragOverlay>
      )}
    </DndTargetContext.Provider>
  );

  // Non-owning tree: rows register into the enclosing DndContext; the
  // monitor feeds this tree's projection handlers from the enclosing
  // context's events (the enclosing context resolves the drop).
  if (isExternal) {
    return (
      <>
        <ExternalTreeMonitor
          onDragStart={handleStart}
          onDragMove={handleMove}
          onDragOver={handleOver}
          onDragEnd={handleEnd}
          onDragCancel={reset}
        />
        {treeBody}
      </>
    );
  }

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
          onDragCancel: ({ active }) => `Cancelled drag of ${String(active.id)}.`,
        },
        screenReaderInstructions: {
          draggable:
            'To pick up a draggable item, press space or enter. While dragging, use the arrow keys to move the item. Press space or enter again to drop the item in its new position, or press escape to cancel.',
        },
      }}
    >
      {treeBody}
    </DndContext>
  );
}
