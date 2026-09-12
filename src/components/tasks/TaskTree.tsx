/**
 * Unified task tree — the single renderer for task rows across the
 * area view, the inbox, task detail panes, and due panes. Every root
 * passed in renders its ENTIRE subtree inline (completed subtasks stay
 * in place, checked + struck through) with `showCompleted` on — the
 * default; with it off, every completed row (and its whole subtree,
 * which is necessarily done too) is pruned, and a subtree whose root
 * is fully done disappears either way.
 *
 * Row chrome splits by leaf vs. parent, derived at render time:
 * - Leaf (no descendants)  — a stored-status checkbox, inline-editable
 *   title, delete, due date, add-sub-task. Leaves have no detail pane.
 * - Parent (≥1 descendant) — an expand caret (inline collapse, device-
 *   persisted) and a name that navigates to the task's detail pane
 *   (`#/t/<id>`), with a derived done/total progress meter instead of
 *   a checkbox. Rename/delete live on the pane.
 *
 * Drag-and-drop runs through one flattened SortableTree (one DndContext
 * spans every depth, so a drag can reorder within a sibling group or
 * reparent across levels); `onMove` is passed straight through — the
 * caller maps a root-level drop (`newParentId === null`) to its own
 * placement. `droppable` gates the drag chrome (read-only surfaces like
 * the static Done group pass `false`).
 *
 * Add-task affordances never create an empty task in the store: they
 * request a draft from hooks/taskDraft.ts, which is spliced into the
 * render order as a static (non-draggable) TaskDraftRow. The task
 * enters the store only when the draft commits. Root-level creation
 * goes through the view's own add input (area/inbox/pane), so this tree
 * only ever splices sub-task drafts (`task:<id>`) and Shift+Enter
 * quick-entry drafts (`afterId`).
 */
import { useEffect, useRef, useState } from 'react';
import {
  useDataLayer,
  useTask,
  useSubtreeProgress,
  updateTask,
  setTaskStatus,
  deleteTask,
  captureSubtree,
  restoreSubtree,
  buildTaskTree,
  pruneDoneTasks,
  pruneCompletedTasks,
  TASK_STATUS,
  NOTE_ENTITY_TYPE,
} from '../../data/index.ts';
import type { TaskTreeNode } from '../../data/index.ts';
import { hasSyncedTaskAdd, clearSyncedTaskAdd } from '../../data/syncedAdds.ts';
import { useUndo } from '../context/useUndo.ts';
import { useSelection } from '../context/useSelection.ts';
import { SortableTree } from '../dnd/SortableTree.tsx';
import type { SortableHandleProps } from '../dnd/SortableList.tsx';
import {
  isTaskDraftNodeId,
  spliceTaskDraft,
  usePendingTaskDraft,
  requestTaskDraft,
} from '../hooks/taskDraft.ts';
import { useCollapsedTaskRows } from '../hooks/useCollapsedTaskRows.ts';
import type { CollapsedSet } from '../hooks/useCollapsedSet.ts';
import TaskDraftRow from './TaskDraftRow.tsx';
import TaskProgressMeter from './TaskProgressMeter.tsx';
import { useAutogrowTextarea } from './useAutogrowTextarea.ts';
import TaskDueDateButton from './TaskDueDateButton.tsx';
import ConfirmModal from '../shared/ConfirmModal.tsx';
import { weekdayWithDate } from '../shared/dates.ts';
import { useDeepTaskIds } from './taskTree.ts';

function TaskTitleInput({
  taskId,
  title,
  onEditingChange,
}: {
  taskId: string;
  title: string;
  /** Notify when the input gains/loses focus — lets the parent
   * surface chrome (the delete trash riding the input) only while the
   * user is actually editing. */
  onEditingChange?: (editing: boolean) => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const [draft, setDraft] = useState(title);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(title);
  }, [title]);

  // Auto-grow: fit on every draft change, re-fit on row-width changes.
  useAutogrowTextarea(ref, draft);

  // Keep the editing-change callback in sync with the input's focus
  // state — focus / blur are the only real signals (the EditableTitle
  // idiom).
  useEffect(() => {
    const el = ref.current;
    if (!el || !onEditingChange) return;
    const onFocus = (): void => onEditingChange(true);
    const onBlur = (): void => onEditingChange(false);
    el.addEventListener('focus', onFocus);
    el.addEventListener('blur', onBlur);
    return () => {
      el.removeEventListener('focus', onFocus);
      el.removeEventListener('blur', onBlur);
    };
  }, [onEditingChange]);

  function commit(): void {
    // Blurring a still-untitled task with an empty draft deletes the
    // row (legacy empty rows / just-cleared titles). Add-task
    // affordances open a draft row that never enters the store until
    // it commits, so this path is rare (see hooks/taskDraft.ts).
    if (title === '' && draft.trim() === '') {
      deleteTask(store, taskId);
      return;
    }
    if (draft !== title) updateTask(store, taskId, { title: draft });
    else setDraft(title);
  }

  return (
    <textarea
      ref={ref}
      className="task-line-title"
      rows={1}
      value={draft}
      placeholder="New task…"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          // Shift+Enter: save this title (via blur) and open a draft
          // row immediately below for quick entry — nothing is created
          // until that draft commits.
          if (e.shiftKey) {
            requestTaskDraft({ afterId: taskId });
          }
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDraft(title);
          e.currentTarget.blur();
        }
      }}
      aria-label="Task title"
    />
  );
}

/** A leaf task row: checkbox, inline-editable title, due date, delete,
 * add-sub-task. Leaves have no detail pane. */
function LeafTaskRow({
  taskId,
  handle,
  showDueDate,
}: {
  taskId: string;
  handle?: SortableHandleProps;
  showDueDate: boolean;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const task = useTask(store, taskId);
  const { offerUndo } = useUndo();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  // Touch layouts collapse the row actions behind a ⋯ trigger; the
  // strip slides out to the left of it. Desktop never opens it.
  const [menuOpen, setMenuOpen] = useState(false);
  // Sync-arrival entrance: mount-time check against the sync-pull
  // registry; the class is dropped on animationend.
  const [syncedIn, setSyncedIn] = useState(() => hasSyncedTaskAdd(taskId));
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  if (!task) return null;
  const done = task.status === TASK_STATUS.done;

  const classes = ['task-line'];
  if (handle) classes.push('sortable-row');
  if (done) classes.push('task-line-done');
  if (syncedIn) classes.push('task-line-synced-in');
  if (handle?.isDragging) classes.push('sortable-row-active');
  if (handle?.isOver) classes.push('sortable-row-over');

  // Long-press touch drag activates from anywhere on the row (grips
  // are hidden on coarse pointers); mouse + keyboard stay on the grip.
  const { onTouchStart, ...gripListeners } = (handle?.listeners ?? {}) as {
    onTouchStart?: React.TouchEventHandler;
  } & Record<string, unknown>;

  return (
    <div
      ref={handle?.ref}
      style={handle?.style}
      className={classes.join(' ')}
      data-drag-over={handle?.isOver ? 'true' : undefined}
      onAnimationEnd={(e) => {
        // Drop the class when the LAST leg ends (the 1s flash) so the
        // background fade plays in full before any later drag could
        // clip its drop-target bar against it.
        if (e.animationName !== 'task-synced-flash') return;
        clearSyncedTaskAdd(taskId);
        setSyncedIn(false);
      }}
      {...(onTouchStart ? { onTouchStart } : {})}
    >
      {handle && (
        <button
          type="button"
          {...(handle.attributes ?? {})}
          className="task-line-drag-handle icon-button"
          aria-label="Drag to reorder"
          title="Drag to reorder"
          onClick={(e) => e.preventDefault()}
          {...gripListeners}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#drag-icon" />
          </svg>
        </button>
      )}
      <input
        type="checkbox"
        className="task-line-check"
        checked={done}
        onChange={() => {
          if (done) {
            setTaskStatus(store, taskId, TASK_STATUS.open);
            return;
          }
          setTaskStatus(store, taskId, TASK_STATUS.done);
          offerUndo({
            label: `Completed “${task.title || 'Untitled'}”`,
            onUndo: () => setTaskStatus(store, taskId, TASK_STATUS.open),
          });
        }}
        aria-label={done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
      />
      <TaskTitleInput taskId={taskId} title={task.title} onEditingChange={setEditing} />
      {editing && (
        // The trash rides the title input and only renders while
        // editing. mousedown is suppressed so this click lands instead
        // of blurring the input first and unmounting the button; the
        // confirm dialog steals focus on open, ending edit mode.
        <button
          type="button"
          className="task-line-action task-line-action-danger icon-button"
          aria-label="Delete task"
          title="Delete"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setConfirmDelete(true)}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#trash-icon" />
          </svg>
        </button>
      )}
      {showDueDate && task.dueDate && (
        <span className="task-line-due-date" aria-label={`Due ${weekdayWithDate(task.dueDate)}`}>
          {weekdayWithDate(task.dueDate)}
        </span>
      )}
      {menuOpen && (
        <div
          className="task-menu-backdrop"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(false);
          }}
        />
      )}
      <div className={`task-line-menu${menuOpen ? ' task-line-menu-open' : ''}`}>
        <div className="task-line-actions" onClickCapture={() => setMenuOpen(false)}>
          <TaskDueDateButton taskId={taskId} />
          <button
            type="button"
            className="task-line-action icon-button"
            aria-label="Add sub-task"
            title="Add sub-task"
            onClick={() => {
              requestTaskDraft({ placement: { kind: 'task', id: taskId } });
            }}
          >
            <svg className="svg-icon" aria-hidden="true">
              <use href="/icons.svg#add-icon" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          className="task-line-action task-line-menu-trigger icon-button"
          aria-label="Task actions"
          title="Task actions"
          aria-expanded={menuOpen}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((open) => !open);
          }}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#more-icon" />
          </svg>
        </button>
      </div>
      <ConfirmModal
        open={confirmDelete}
        title="Delete task?"
        message={`"${task.title || 'Untitled'}" will be deleted.`}
        confirmLabel="Delete"
        onConfirm={() => {
          const snapshot = captureSubtree(store, NOTE_ENTITY_TYPE.task, taskId);
          deleteTask(store, taskId);
          setConfirmDelete(false);
          offerUndo({
            label: `Deleted “${task.title || 'Untitled'}”`,
            onUndo: () => restoreSubtree(store, snapshot),
          });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

/** A parent task row: expand caret, name that navigates to the task's
 * detail pane, and a derived done/total progress meter (no checkbox —
 * a parent's done state is derived from its descendants). Rename and
 * delete live on the pane. */
function ParentTaskRow({
  taskId,
  handle,
  collapsedRows,
  showDueDate,
}: {
  taskId: string;
  handle?: SortableHandleProps;
  collapsedRows: CollapsedSet;
  showDueDate: boolean;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const task = useTask(store, taskId);
  const { navigate } = useSelection();
  const collapsed = collapsedRows.collapsed.has(taskId);
  const [syncedIn, setSyncedIn] = useState(() => hasSyncedTaskAdd(taskId));
  if (!task) return null;

  const display = task.title || 'Untitled';
  const openPane = (): void => {
    navigate({ kind: 'task', id: taskId });
  };

  const classes = ['task-line'];
  if (handle) classes.push('sortable-row');
  if (syncedIn) classes.push('task-line-synced-in');
  if (handle?.isDragging) classes.push('sortable-row-active');
  if (handle?.isOver) classes.push('sortable-row-over');

  const { onTouchStart, ...gripListeners } = (handle?.listeners ?? {}) as {
    onTouchStart?: React.TouchEventHandler;
  } & Record<string, unknown>;

  return (
    <div
      ref={handle?.ref}
      style={handle?.style}
      className={classes.join(' ')}
      data-drag-over={handle?.isOver ? 'true' : undefined}
      onAnimationEnd={(e) => {
        if (e.animationName !== 'task-synced-flash') return;
        clearSyncedTaskAdd(taskId);
        setSyncedIn(false);
      }}
      {...(onTouchStart ? { onTouchStart } : {})}
    >
      {handle && (
        <button
          type="button"
          {...(handle.attributes ?? {})}
          className="task-line-drag-handle icon-button"
          aria-label="Drag to reorder"
          title="Drag to reorder"
          onClick={(e) => e.preventDefault()}
          {...gripListeners}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#drag-icon" />
          </svg>
        </button>
      )}
      <button
        type="button"
        className="project-row-caret icon-button"
        aria-label={collapsed ? `Expand ${display}` : `Collapse ${display}`}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand subtasks' : 'Collapse subtasks'}
        onClick={(e) => {
          e.stopPropagation();
          collapsedRows.toggle(taskId);
        }}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href={`/icons.svg#${collapsed ? 'chevron-right-icon' : 'chevron-down-icon'}`} />
        </svg>
      </button>
      <button
        type="button"
        className="task-line-title project-row-name"
        title="Open task"
        onClick={(e) => {
          e.stopPropagation();
          openPane();
        }}
      >
        {display}
      </button>
      {showDueDate && task.dueDate && (
        <span className="task-line-due-date" aria-label={`Due ${weekdayWithDate(task.dueDate)}`}>
          {weekdayWithDate(task.dueDate)}
        </span>
      )}
      <TaskDueDateButton taskId={taskId} />
      <button
        type="button"
        className="task-line-action icon-button"
        aria-label="Add sub-task"
        title="Add sub-task"
        onClick={() => {
          if (collapsed) collapsedRows.toggle(taskId);
          requestTaskDraft({ placement: { kind: 'task', id: taskId } });
        }}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#add-icon" />
        </svg>
      </button>
      <TaskProgressMeter taskId={taskId} />
    </div>
  );
}

/** A row routes to its leaf/parent form by its descendant count. */
function TaskTreeRow({
  taskId,
  handle,
  collapsedRows,
  showDueDate,
}: {
  taskId: string;
  handle?: SortableHandleProps;
  collapsedRows: CollapsedSet;
  showDueDate: boolean;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const { total } = useSubtreeProgress(store, taskId);
  if (total > 0) {
    return (
      <ParentTaskRow
        taskId={taskId}
        handle={handle}
        collapsedRows={collapsedRows}
        showDueDate={showDueDate}
      />
    );
  }
  return <LeafTaskRow taskId={taskId} handle={handle} showDueDate={showDueDate} />;
}

/**
 * Mark collapsed parents as leaf-shaped (`children: []`) so the
 * flattened tree hides their subtree; the row itself still renders
 * (its parent chrome comes from the descendant count, not the node).
 */
function applyCollapse(
  nodes: readonly TaskTreeNode[],
  collapsed: ReadonlySet<string>,
): TaskTreeNode[] {
  let changed = false;
  const out = nodes.map((n) => {
    if (collapsed.has(n.id)) {
      changed = true;
      return { id: n.id, children: [] };
    }
    const children = applyCollapse(n.children, collapsed);
    if (children === n.children) return n;
    changed = true;
    return { id: n.id, children };
  });
  return changed ? out : (nodes as TaskTreeNode[]);
}

export default function TaskTree({
  rootIds,
  onMove,
  droppable = true,
  showCompleted = true,
  showDueDate = true,
  externalDndContext = false,
  draftRootTaskId,
}: {
  /** Root task ids (top-level of this tree), in canonical order. */
  rootIds: readonly string[];
  /**
   * Drop handler. `newParentId` is the new parent task (`null` = root
   * level of this tree — the caller maps that to the view's own
   * placement); `beforeId` is the sibling the row now sits before
   * (`undefined` = last child).
   */
  onMove: (activeId: string, newParentId: string | null, beforeId: string | undefined) => void;
  /** False renders the tree read-only (no drag chrome). */
  droppable?: boolean;
  /** False prunes every completed row (and its subtree) from the tree. */
  showCompleted?: boolean;
  /** False suppresses static row dates when an enclosing bucket already provides the date. */
  showDueDate?: boolean;
  /** True registers this tree into the enclosing DndContext instead of
   * owning one (RootGroups' hoisted group drops). */
  externalDndContext?: boolean;
  /**
   * Set when this tree's roots ARE the direct children of the named
   * task (TaskPane's viewed task, DuePane's due-root subtree): a draft
   * targeting that task (`placement` kind `'task'`) cannot be found by
   * the DFS splice, so this tree — and ONLY this tree — appends it at
   * its root. Without the gate, every mounted tree that lacks the
   * target would append the draft at its own root, mounting duplicate
   * draft rows whose focus race instantly blur-cancels the draft.
   */
  draftRootTaskId?: string;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const collapsedRows = useCollapsedTaskRows();
  // buildTaskTree needs the flat deep list (roots + all descendants).
  const allIds = useDeepTaskIds(store, rootIds);
  const draft = usePendingTaskDraft();

  const tree = buildTaskTree(store, allIds);
  // Show mode prunes only fully-done root subtrees (completed subtasks
  // of an active/backlog root stay visible in place, checked and
  // struck through). Hide mode prunes every completed node instead.
  const pruned = showCompleted
    ? pruneDoneTasks(store, tree.children)
    : pruneCompletedTasks(store, tree.children);
  let spliced = draft ? spliceTaskDraft(pruned, draft) : pruned;
  if (
    draft !== null &&
    spliced === pruned &&
    draft.placement !== undefined &&
    draft.placement.kind === 'task' &&
    draft.placement.id === draftRootTaskId
  ) {
    spliced = [...pruned, { id: draft.nodeId, children: [] }];
  }
  const nodes = applyCollapse(spliced as TaskTreeNode[], collapsedRows.collapsed);
  // Empty-tree check AFTER splicing: an empty group still renders when
  return (
    <SortableTree
      nodes={nodes}
      onMove={droppable ? onMove : () => {}}
      ariaLabel="Tasks"
      className="sortable-list"
      indentWidth={22}
      isStatic={isTaskDraftNodeId}
      externalDndContext={externalDndContext}
    >
      {(tid, handle) =>
        draft !== null && tid === draft.nodeId ? (
          <TaskDraftRow draft={draft} handle={handle} />
        ) : (
          <TaskTreeRow
            taskId={tid}
            handle={droppable ? handle : undefined}
            collapsedRows={collapsedRows}
            showDueDate={showDueDate}
          />
        )
      }
    </SortableTree>
  );
}