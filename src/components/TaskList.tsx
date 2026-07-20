/**
 * Core task list — the single renderer for task rows across the
 * inbox, area, and project views. View-specific differences are
 * flags on TaskRow / the list wrappers, never separate components:
 *
 * - `readOnly`        — area flat list: span title, no row
 *                       actions (person, add sub-task, delete).
 * - `effectiveStatus` — flat lists show ancestor-aware effective
 *                       status; trees use the task's own status.
 * - `handle`          — SortableList/SortableTree handle; presence
 *                       enables the drag handle and sortable chrome.
 * - `showCompleted`   — TaskTreeByStatus only: render done tasks in
 *                       place (checked + strikethrough) instead of
 *                       pruning their subtrees from the tree.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MergeableStore } from 'tinybase';
import {
  useDataLayer,
  useTask,
  useEffectiveTaskStatus,
  createTask,
  createTaskAfter,
  updateTask,
  setTaskStatus,
  deleteTask,
  getRootPlacement,
  buildTaskTree,
  TABLES,
  TASK_STATUS,
  NOTE_ENTITY_TYPE,
  COLUMNS,
} from '../data/index.ts';
import type { TaskTreeNode } from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import { SortableTree } from './SortableTree.tsx';
import type { SortableHandleProps } from './SortableList.tsx';
import PersonAssignmentButton from './persons/PersonAssignmentButton.tsx';
import TaskDueDateButton from './TaskDueDateButton.tsx';
import ConfirmModal from './ConfirmModal.tsx';

function isTaskDone(store: MergeableStore, taskId: string): boolean {
  if (!store.hasRow(TABLES.tasks, taskId)) return false;
  return store.getCell(TABLES.tasks, taskId, COLUMNS.tasks.status) === TASK_STATUS.done;
}

/**
 * Id of a freshly created task whose title input should grab focus once
 * mounted. Set by the "Add sub-task" action before the store write so
 * the new row's TaskTitleInput picks it up in its mount effect, then
 * cleared on consumption. Module-scoped because the input mounts deep
 * inside the (possibly re-navigated) task tree.
 */
let pendingTitleFocus: string | null = null;

/**
 * Prune done subtrees out of a task tree, once, so hidden-completed
 * mode drops a done task and everything nested under it. Sibling
 * order is preserved.
 */
function pruneDoneTasks(
  store: MergeableStore,
  nodes: readonly TaskTreeNode[],
): TaskTreeNode[] {
  const out: TaskTreeNode[] = [];
  for (const node of nodes) {
    if (isTaskDone(store, node.id)) continue;
    out.push({ id: node.id, children: pruneDoneTasks(store, node.children) });
  }
  return out;
}

function TaskTitleInput({
  taskId,
  title,
}: {
  taskId: string;
  title: string;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const [draft, setDraft] = useState(title);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (pendingTitleFocus === taskId) {
      pendingTitleFocus = null;
      ref.current?.focus();
    }
  }, [taskId]);

  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(title);
  }, [title]);

  // Auto-grow: collapse then measure so the textarea wraps at the row
  // width instead of scrolling horizontally like a single-line input.
  // ResizeObserver re-fits when the row width changes (window resize)
  // even though the draft text did not.
  const fitRef = useRef<() => void>(() => {});
  fitRef.current = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    fitRef.current();
  }, [draft]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fitRef.current());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function commit(): void {
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
          // Shift+Enter: save this title (via blur) and open a fresh
          // empty sibling immediately below, focused for quick entry.
          if (e.shiftKey) {
            const nextId = createTaskAfter(store, taskId, '');
            if (nextId) pendingTitleFocus = nextId;
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

export interface TaskRowProps {
  taskId: string;
  /** Inbox/area flat lists: read-only title, no row actions. */
  readOnly?: boolean;
  /** Use ancestor-aware effective status for the checkbox and dimming. */
  effectiveStatus?: boolean;
  /** Sortable handle — presence enables the drag handle and chrome. */
  handle?: SortableHandleProps;
}

export function TaskRow({
  taskId,
  readOnly,
  effectiveStatus,
  handle,
}: TaskRowProps): React.JSX.Element | null {
  const { store } = useDataLayer();
  const task = useTask(store, taskId);
  const effective = useEffectiveTaskStatus(store, taskId);
  const { navigate } = useSelection();
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!task || (effectiveStatus && !effective)) return null;
  const done = effectiveStatus
    ? effective === TASK_STATUS.done
    : task.status === TASK_STATUS.done;

  const classes = ['task-line'];
  if (handle) classes.push('sortable-row');
  if (done) classes.push('task-line-done');
  if (handle?.isDragging) classes.push('sortable-row-active');
  if (handle?.isOver) classes.push('sortable-row-over');

  return (
    <div
      ref={handle?.ref}
      style={handle?.style}
      className={classes.join(' ')}
      data-drag-over={handle?.isOver ? 'true' : undefined}
    >
      {handle && (
        <button
          type="button"
          className="task-line-drag-handle"
          aria-label="Drag to reorder"
          title="Drag to reorder"
          onClick={(e) => e.preventDefault()}
          {...(handle.listeners ?? {})}
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
        onChange={() =>
          setTaskStatus(store, taskId, done ? TASK_STATUS.open : TASK_STATUS.done)
        }
        aria-label={done ? 'Mark not done' : 'Mark done'}
      />
      {readOnly ? (
        <span className="task-line-title">{task.title}</span>
      ) : (
        <TaskTitleInput taskId={taskId} title={task.title} />
      )}
      {!readOnly && (
        <>
          <TaskDueDateButton taskId={taskId} />
          <PersonAssignmentButton
            entityType={NOTE_ENTITY_TYPE.task}
            entityId={taskId}
          />
          <button
            type="button"
            className="task-line-action"
            aria-label="Add sub-task"
            title="Add sub-task"
            onClick={() => {
              const childId = createTask(store, {
                title: '',
                placement: { kind: 'task', id: taskId },
              });
              pendingTitleFocus = childId;
              const root = getRootPlacement(store, taskId);
              if (root.kind === 'project') navigate({ kind: 'project', id: root.id });
              else if (root.kind === 'area') navigate({ kind: 'area', id: root.id });
            }}
          >
            <svg className="svg-icon" aria-hidden="true">
              <use href="/icons.svg#plus-filled-icon" />
            </svg>
          </button>
          <button
            type="button"
            className="task-line-action task-line-action-danger"
            aria-label="Delete task"
            title="Delete"
            onClick={() => setConfirmDelete(true)}
          >
            <svg className="svg-icon" aria-hidden="true">
              <use href="/icons.svg#trash-icon" />
            </svg>
          </button>
          <ConfirmModal
            open={confirmDelete}
            title="Delete task?"
            message={`"${task.title || 'Untitled'}" will be deleted.`}
            confirmLabel="Delete"
            onConfirm={() => {
              deleteTask(store, taskId);
              setConfirmDelete(false);
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        </>
      )}
    </div>
  );
}

/**
 * Flat task list (inbox, area tasks). Rows render in the given
 * order with no drag-and-drop.
 */
export function TaskList({
  ids,
  readOnly,
  effectiveStatus,
}: {
  ids: readonly string[];
  readOnly?: boolean;
  effectiveStatus?: boolean;
}): React.JSX.Element {
  return (
    <ul className="task-list">
      {ids.map((tid) => (
        <li key={tid}>
          <TaskRow taskId={tid} readOnly={readOnly} effectiveStatus={effectiveStatus} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Task tree rendered through a single flattened SortableTree — one
 * DndContext spans every depth, so a drag can reorder within a sibling
 * group or reparent a task under another task / back to the root.
 * Indentation is the slot's `depth * indentWidth` left padding.
 */
export function TaskTree({
  nodes,
  onMove,
  ariaLabel,
}: {
  nodes: readonly TaskTreeNode[];
  /**
   * Drop handler. `newParentId` is the new parent task (`null` = root
   * of this tree — the caller maps that to the view's own placement).
   */
  onMove?: (activeId: string, newParentId: string | null, beforeId: string | undefined) => void;
  ariaLabel?: string;
}): React.JSX.Element | null {
  if (nodes.length === 0) return null;
  return (
    <SortableTree
      nodes={nodes}
      onMove={onMove ?? (() => {})}
      ariaLabel={ariaLabel ?? 'Tasks'}
      className="sortable-list"
      indentWidth={22}
    >
      {(tid, handle) => <TaskRow handle={handle} taskId={tid} />}
    </SortableTree>
  );
}

/**
 * Project/area task tree: build the tree from `ids` and render it in
 * stored order. With `showCompleted` off, done tasks (and their
 * subtrees) are pruned; with it on, done rows stay in place with a
 * checked checkbox and strikethrough title.
 */
export function TaskTreeByStatus({
  ids,
  onMove,
  ariaLabel,
  showCompleted = false,
}: {
  ids: readonly string[];
  onMove?: (activeId: string, newParentId: string | null, beforeId: string | undefined) => void;
  ariaLabel?: string;
  /** Show done tasks in place instead of hiding them. */
  showCompleted?: boolean;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const tree = buildTaskTree(store, ids);
  const nodes = showCompleted ? tree.children : pruneDoneTasks(store, tree.children);
  return (
    <TaskTree
      nodes={nodes}
      onMove={onMove}
      ariaLabel={ariaLabel}
    />
  );
}
