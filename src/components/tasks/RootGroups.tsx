import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { ContextDndMonitor } from '../dnd/SortableTree.tsx';
import {
  useDataLayer,
  useSubtreeProgress,
  useTask,
  moveTask,
  moveRootToBacklog,
  childTaskIds,
  sortTaskIds,
  PLACEMENT_SEP,
} from '../../data/index.ts';
import { useSelection } from '../context/useSelection.ts';
import { useCollapsedTaskGroups } from '../hooks/useCollapsedTaskGroups.ts';
import { useCollapsedTaskRows } from '../hooks/useCollapsedTaskRows.ts';
import Group from './Group.tsx';
import TaskTree from './TaskTree.tsx';
import {
  containerId,
  headerContainerId,
  resolveTaskGroupDrop,
} from '../dnd/rootTaskGroupDrop.ts';
import type {
  GroupTarget,
  RootPosition,
  RootTaskGroup,
} from '../dnd/rootTaskGroupDrop.ts';

export type TaskGroupId = 'active' | 'backlog' | 'done';

/**
 * One area's (or the inbox's) root tasks inside the hoisted
 * Active / Backlog / Done groups — the viewed area itself, one rolled-in
 * sub-area, or the inbox. Each slice contributes its tri-state-partitioned
 * root ids to the matching hoisted group; sub-area slices carry their own
 * header.
 */
export interface RootGroupSlice {
  /** Stable key for the slice (area id, or 'inbox'). */
  key: string;
  /** Slice header label; null renders headerless (the viewed area's own
   * slice / the inbox). */
  label: string | null;
  /** Root placement string a root-level drop inside this slice maps to
   * (`area:<id>`, or `null` for the inbox). */
  placement: string | null;
  /** Root task ids per tri-state group, each in canonical order. */
  active: readonly string[];
  backlog: readonly string[];
  done: readonly string[];
  /** Optional slice header node (e.g. a clickable sub-area nav). */
  header?: ReactNode;
}

const GROUPS: readonly { id: TaskGroupId; title: string }[] = [
  { id: 'active', title: 'Active' },
  { id: 'backlog', title: 'Backlog' },
  { id: 'done', title: 'Done' },
];

/** A done root rendered statically: caret (expand the all-done subtree)
 * and a name that navigates to the task's pane — no other controls. The
 * Done group is never a drop target and its rows are never editable. */
function DoneTaskRow({
  taskId,
  depth,
}: {
  taskId: string;
  depth: number;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const task = useTask(store, taskId);
  const { navigate } = useSelection();
  const { collapsed, toggle } = useCollapsedTaskRows();
  const { total } = useSubtreeProgress(store, taskId);
  if (!task) return null;
  const display = task.title || 'Untitled';
  const isParent = total > 0;
  const isCollapsed = collapsed.has(taskId);
  return (
    <>
      <div className="task-line task-line-done" style={{ paddingLeft: depth * 22 }}>
        {isParent && (
          <button
            type="button"
            className="project-row-caret icon-button"
            aria-label={isCollapsed ? `Expand ${display}` : `Collapse ${display}`}
            aria-expanded={!isCollapsed}
            title={isCollapsed ? 'Expand subtasks' : 'Collapse subtasks'}
            onClick={(e) => {
              e.stopPropagation();
              toggle(taskId);
            }}
          >
            <svg className="svg-icon" aria-hidden="true">
              <use
                href={`/icons.svg#${isCollapsed ? 'chevron-right-icon' : 'chevron-down-icon'}`}
              />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="task-line-title project-row-name"
          title="Open task"
          onClick={() => navigate({ kind: 'task', id: taskId })}
        >
          {display}
        </button>
        {isParent && <StaticDoneMeter done={total} total={total} />}
      </div>
      {isParent && !isCollapsed && (
        <StaticDoneChildren parentId={taskId} depth={depth + 1} />
      )}
    </>
  );
}

/** Full-meter (done === total) for a done subtree row. */
function StaticDoneMeter({ done, total }: { done: number; total: number }): React.JSX.Element {
  return (
    <div className="project-row-progress" aria-label={`${done} of ${total} subtasks done`}>
      <div className="project-row-progress-bar project-row-progress-done">
        <div className="project-row-progress-fill" style={{ transform: 'scaleX(1)' }} />
      </div>
      <span className="project-row-progress-count">
        {done} / {total}
      </span>
    </div>
  );
}

/** Direct children of a done parent, each rendered statically. */
function StaticDoneChildren({
  parentId,
  depth,
}: {
  parentId: string;
  depth: number;
}): React.JSX.Element {
  const { store } = useDataLayer();
  // Direct children of the done parent, in canonical order.
  const ids = sortTaskIds(store, childTaskIds(store, parentId));
  return (
    <>
      {ids.map((id) => (
        <DoneTaskRow key={id} taskId={id} depth={depth} />
      ))}
    </>
  );
}

/**
 * The standing drop zone wrapping one group's body (the slice rows) so
 * a drop in the group's empty space — or below the last row — appends
 * to that group. Also the container that makes an empty Backlog group
 * a viable drop target (the ghost hint stays). Invisible at rest; only
 * direct pointer overlap paints the drop affordance.
 */
function GroupDropZone({
  scopeKey,
  group,
  className,
  children,
}: {
  scopeKey: string;
  group: RootTaskGroup;
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: containerId(scopeKey, group),
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

/**
 * The hoisted group header as a drop target: dropping on Active /
 * Backlog appends to the group's slice in the viewed scope. Distinct id
 * from the standing zone — header and container are separate droppables
 * in the same DndContext. MUST render inside the DndContext tree (the
 * hook registers against the context's store). `valid` is false when
 * the dragged row is not a root of this view (e.g. a subtask) — the
 * header stays quiet because the drop would resolve to null.
 */
function GroupHeaderDropTarget({
  target,
  dragging,
  valid,
  children,
}: {
  target: GroupTarget;
  /** A drag is in flight (any row). */
  dragging: boolean;
  /** False when the dragged row can't land here (subtask). */
  valid: boolean;
  children: (dropProps: {
    dropRef: (node: HTMLElement | null) => void;
    dropActive: boolean;
    dropOver: boolean;
  }) => ReactNode;
}): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: headerContainerId(target.scopeKey, target.group),
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

/** One slice's rows inside a hoisted group: its header (if any) plus a
 * tree (Active/Backlog) or static done rows (Done). */
function SliceRows({
  slice,
  group,
  droppable,
}: {
  slice: RootGroupSlice;
  group: TaskGroupId;
  droppable: boolean;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const ids = group === 'active' ? slice.active : group === 'backlog' ? slice.backlog : slice.done;
  function onMove(
    activeId: string,
    parentId: string | null,
    beforeId: string | undefined,
  ): void {
    moveTask(
      store,
      activeId,
      parentId ? `task${PLACEMENT_SEP}${parentId}` : slice.placement,
      beforeId,
    );
  }
  return (
    <div className="subarea-section" data-group={group}>
      {slice.header ?? (slice.label !== null ? (
        <header className="subarea-header">
          <span className="subarea-header-name subarea-header-static">{slice.label}</span>
        </header>
      ) : null)}
      {group === 'done' ? (
        ids.map((id) => <DoneTaskRow key={id} taskId={id} depth={0} />)
      ) : (
        <TaskTree rootIds={ids} onMove={onMove} droppable={droppable} externalDndContext />
      )}
    </div>
  );
}

/**
 * The Active / Backlog / Done root-task groups shared by the area view
 * and the inbox. Each hoisted group renders once; inside it, every slice
 * (the viewed area, its sub-areas, or the inbox) appears in turn. Done is
 * static (no controls beyond caret/name navigation) and is never a drop
 * target. Per-group collapse is persisted per device.
 *
 * Hoisted drag: the DndContext now lives one level up, at the shell
 * (ShellDndContext), and spans the sidebar's area tree AND every slice's
 * TaskTree, so a drag can reorder within a tree, cross slices (ownership
 * change), AND shelve / unshelve across the Active ⇄ Backlog boundary.
 * The group headers and standing body zones are droppables in that
 * context; this component observes it via ContextDndMonitor and resolves
 * group/header drops through `resolveTaskGroupDrop` to
 * `moveRootToBacklog` (shelve/unshelve) or `moveTask` (reorder /
 * cross-slice ownership change). Only ROOT rows participate — subtasks
 * nest/unnest within their own tree and never resolve to a group drop.
 */
export default function RootGroups({
  slices,
  droppable = true,
  renderGroupAction,
  renderGroupFooter,
}: {
  slices: readonly RootGroupSlice[];
  /** False renders every tree read-only. */
  droppable?: boolean;
  /** Action at the right edge of the Active / Backlog group headers. */
  renderGroupAction?: (group: 'active' | 'backlog') => ReactNode;
  /** Content appended at the end of a group (e.g. an add-task input). A
   * non-null return counts as group content, keeping an otherwise-empty
   * expanded group's list mounted. */
  renderGroupFooter?: (group: TaskGroupId) => ReactNode;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { collapsed, toggle } = useCollapsedTaskGroups();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // The hoisted drop targets hang off the view's own scope: the inbox
  // scope ('inbox') or the viewed area id (the headerless first slice).
  const scopeKey = slices[0]?.key ?? 'inbox';

  /** Locate a root task id across every slice's Active/Backlog rows.
   * Done rows and subtasks are never here — the guard that keeps group
   * drops root-only. */
  const findPosition = useCallback(
    (taskId: string): RootPosition | null => {
      for (const s of slices) {
        if (s.active.includes(taskId)) return { sliceKey: s.key, group: 'active' };
        if (s.backlog.includes(taskId)) return { sliceKey: s.key, group: 'backlog' };
      }
      return null;
    },
    [slices],
  );

  /** The root ids of one slice+group, in canonical order. */
  const idsIn = useCallback(
    (pos: RootPosition): readonly string[] => {
      const slice = slices.find((s) => s.key === pos.sliceKey);
      if (!slice) return [];
      return pos.group === 'active' ? slice.active : slice.backlog;
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
      // Same-tree row drops are handled by the tree's own `onMove` (its

      // Same-tree row drops are handled by the tree's own `onMove` (its
      // ExternalTreeMonitor feeds it from this same context); the
      // hoisted context only resolves group-container/header drops and
      // cross-group / cross-slice row drops. Without this guard the
      // drop would move the row twice.
      const source = findPosition(dragId);
      const target = findPosition(overId);
      if (
        source &&
        target &&
        source.sliceKey === target.sliceKey &&
        source.group === target.group
      ) {
        return;
      }
      const resolved = resolveTaskGroupDrop(dragId, overId, findPosition, idsIn);
      if (!resolved) return;
      if (resolved.kind === 'reorder') {
        if (!source) return;
        // Same-group container drop appends to the dragged row's own
        // slice; a cross-slice row drop changes ownership to the target
        // slice (whose placement the resolver's target names).
        const overPos = findPosition(overId);
        const slice = slices.find((s) => s.key === (overPos?.sliceKey ?? source.sliceKey));
        if (!slice) return;
        moveTask(store, dragId, slice.placement, resolved.beforeId);
      } else {
        moveRootToBacklog(store, dragId, resolved.kind === 'shelve', resolved.beforeId);
      }
    },
    [store, findPosition, idsIn, slices],
  );

  const handleCancel = useCallback(() => {
    setDraggingId(null);
  }, []);

  /** The dragged row must be a root of this view for the group headers
   * to light up (a subtask can't shelf — the resolver returns null). */
  const draggingIsRoot = draggingId !== null && findPosition(draggingId) !== null;

  const activeTarget = { scopeKey, group: 'active' as RootTaskGroup };
  const backlogTarget = { scopeKey, group: 'backlog' as RootTaskGroup };

  // The add-task input renders appended at the end of the Active group.
  const activeFooter = renderGroupFooter?.('active') ?? null;
  const backlogFooter = renderGroupFooter?.('backlog') ?? null;

  const renderGroup = (entry: (typeof GROUPS)[number]): React.JSX.Element => {
    const g = entry.id;
    const total = slices.reduce((n, s) => n + s[g].length, 0);
    const footer = g === 'active' ? activeFooter : g === 'backlog' ? backlogFooter : null;
    const hasContent = total > 0 || footer !== null;
    const groupProps = {
      title: entry.title,
      count: total,
      collapsed: collapsed.has(g),
      onToggleCollapse: () => toggle(g),
      trailing: g !== 'done' && renderGroupAction ? renderGroupAction(g) : undefined,
      hasContent,
      emptyHint: g === 'backlog' ? 'Drag a task here to shelve it' : undefined,
    };
    const body = (
      <>
        {slices.map((slice) => (
          <SliceRows
            key={`${g}:${slice.key}`}
            slice={slice}
            group={g}
            droppable={droppable}
          />
        ))}
        {footer}
      </>
    );
    if (g === 'done') {
      // Done is never a drop target: no droppable wrapper, no header
      // target — the Group renders bare.
      return <Group key={g} {...groupProps}>{body}</Group>;
    }
    const target = g === 'active' ? activeTarget : backlogTarget;
    return (
      <GroupHeaderDropTarget
        key={g}
        target={target}
        dragging={draggingId !== null}
        valid={draggingIsRoot}
      >
        {(dropProps) => (
          <Group key={g} {...groupProps} {...dropProps}>
            <GroupDropZone scopeKey={scopeKey} group={g}>
              {body}
            </GroupDropZone>
          </Group>
        )}
      </GroupHeaderDropTarget>
    );
  };

  return (
    <>
      <ContextDndMonitor
        onDragStart={handleStart}
        onDragEnd={handleEnd}
        onDragCancel={handleCancel}
      />
      {GROUPS.map(renderGroup)}
    </>
  );
}
