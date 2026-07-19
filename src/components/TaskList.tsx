/**
 * Core task list — the single renderer for task rows across the
 * inbox, area, and project views. View-specific differences are
 * flags on TaskRow / the list wrappers, never separate components:
 *
 * - `readOnly`        — inbox/area flat lists: span title, no row
 *                       actions (person, add sub-task, delete).
 * - `effectiveStatus` — flat lists show ancestor-aware effective
 *                       status; trees use the task's own status.
 * - `doneGroup`       — row rendered inside the DONE tree (dimmed).
 * - `handle`          — SortableList handle; presence enables the
 *                       drag handle and sortable chrome.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MergeableStore } from 'tinybase';
import {
  useDataLayer,
  useTask,
  useEffectiveTaskStatus,
  createTask,
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
import { SortableList } from './SortableList.tsx';
import type { SortableHandleProps } from './SortableList.tsx';
import PersonAssignmentButton from './persons/PersonAssignmentButton.tsx';
import ConfirmModal from './ConfirmModal.tsx';
import Group from './Group.tsx';

function isTaskDone(store: MergeableStore, taskId: string): boolean {
  if (!store.hasRow(TABLES.tasks, taskId)) return false;
  return store.getCell(TABLES.tasks, taskId, COLUMNS.tasks.status) === TASK_STATUS.done;
}

function countTree(nodes: readonly TaskTreeNode[]): number {
  let n = 0;
  for (const node of nodes) n += 1 + countTree(node.children);
  return n;
}

/**
 * Split a task tree by stored status, once, into paired open/done
 * trees so children of a done ancestor stay nested under the done
 * row (matching the open behaviour) while still being grouped under
 * the DONE header. A done task carries its whole subtree along.
 */
function splitTaskTreeByStatus(
  store: MergeableStore,
  tree: TaskTreeNode,
): { openNodes: TaskTreeNode[]; doneNodes: TaskTreeNode[] } {
  const openNodes: TaskTreeNode[] = [];
  const doneNodes: TaskTreeNode[] = [];
  function split(node: TaskTreeNode, sinkOpen: TaskTreeNode[], sinkDone: TaskTreeNode[]): void {
    const openChildren: TaskTreeNode[] = [];
    const doneChildren: TaskTreeNode[] = [];
    for (const c of node.children) {
      if (isTaskDone(store, c.id)) split(c, doneChildren, doneChildren);
      else split(c, openChildren, doneChildren);
    }
    const out: TaskTreeNode[] = isTaskDone(store, node.id) ? sinkDone : sinkOpen;
    out.push({ id: node.id, children: isTaskDone(store, node.id) ? doneChildren : openChildren });
  }
  for (const top of tree.children) split(top, openNodes, doneNodes);
  return { openNodes, doneNodes };
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
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
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
  /** Rendered inside the DONE tree (forces dimmed styling). */
  doneGroup?: boolean;
  /** SortableList handle — presence enables the drag handle and chrome. */
  handle?: SortableHandleProps;
  /** Nested subtree, rendered indented below the row. */
  children?: React.ReactNode;
}

export function TaskRow({
  taskId,
  readOnly,
  effectiveStatus,
  doneGroup,
  handle,
  children,
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
  if (doneGroup || done) classes.push('task-line-done');
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
              createTask(store, { title: 'Untitled', placement: { kind: 'task', id: taskId } });
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
      {children && <div className="task-line-children">{children}</div>}
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
 * Recursive task tree. `sortable` renders each sibling group as its
 * own SortableList so drag-and-drop is confined to one sibling
 * group — sub-tasks can't be reordered into a different parent's
 * child list. Non-sortable renders the flat <ul> used by the DONE
 * tree. Indentation comes from `.task-line-children` padding.
 */
export function TaskTree({
  nodes,
  sortable,
  onReorder,
  ariaLabel,
}: {
  nodes: readonly TaskTreeNode[];
  sortable?: boolean;
  onReorder?: (activeId: string, beforeId: string | undefined) => void;
  ariaLabel?: string;
}): React.JSX.Element | null {
  if (nodes.length === 0) return null;
  if (sortable) {
    const ids = nodes.map((n) => n.id);
    return (
      <SortableList
        itemIds={ids}
        onReorder={onReorder ?? (() => {})}
        ariaLabel={ariaLabel ?? 'Tasks'}
        className="sortable-list"
      >
        {(tid, handle) => {
          const children = nodes.find((n) => n.id === tid)?.children ?? [];
          return (
            <TaskRow handle={handle} taskId={tid}>
              {children.length > 0 && (
                <TaskTree
                  nodes={children}
                  sortable
                  onReorder={onReorder}
                  ariaLabel={ariaLabel}
                />
              )}
            </TaskRow>
          );
        }}
      </SortableList>
    );
  }
  return (
    <ul className="task-tree-done" role="list">
      {nodes.map((node) => (
        <li key={node.id} className="task-tree-done-row">
          <TaskRow taskId={node.id} doneGroup>
            {node.children.length > 0 && <TaskTree nodes={node.children} />}
          </TaskRow>
        </li>
      ))}
    </ul>
  );
}

/**
 * Project-style task view: build the tree from `ids`, split it by
 * status, and render the open tree (sortable) above a DONE group.
 */
export function TaskTreeByStatus({
  ids,
  sortable,
  onReorder,
  ariaLabel,
}: {
  ids: readonly string[];
  sortable?: boolean;
  onReorder?: (activeId: string, beforeId: string | undefined) => void;
  ariaLabel?: string;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const tree = buildTaskTree(store, ids);
  const { openNodes, doneNodes } = splitTaskTreeByStatus(store, tree);
  return (
    <>
      {openNodes.length > 0 && (
        <TaskTree
          nodes={openNodes}
          sortable={sortable}
          onReorder={onReorder}
          ariaLabel={ariaLabel}
        />
      )}
      {doneNodes.length > 0 && (
        <Group title="DONE" count={countTree(doneNodes)}>
          <TaskTree nodes={doneNodes} />
        </Group>
      )}
    </>
  );
}
