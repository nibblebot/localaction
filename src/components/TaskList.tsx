/**
 * Task list for a Project. Top-level tasks render first; each task can be
 * expanded to show its sub-Tasks (arbitrary depth via `parentTaskId`).
 * Checkbox toggles `open`/`done`; "Add Task" appends a sibling; each task
 * row has an add-sub-task and a delete action.
 *
 * Orphaned tasks (whose parent task was deleted) are NOT shown here — they
 * belong to the project only via `projectId`, and a deleted parent leaves
 * `parentTaskId` dangling. They still appear at their project's top level so
 * the user can re-parent them. (See issue 06 orphan policy.)
 */

import { useState } from 'react';
import { useRow, useRowIds } from 'tinybase/ui-react';
import {
  useDataLayer,
  createTask,
  updateTask,
  deleteTask,
  setTaskStatus,
  getChildTasks,
  getTasksForProject,
  COLUMNS,
  TABLES,
  TASK_STATUS,
} from '../data/index.ts';
import type { MergeableStore } from 'tinybase';
import type { TaskStatus } from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import { ConfirmButton } from './ConfirmButton.tsx';

const NEW_TASK_TITLE = 'New task';

export interface TaskListProps {
  projectId: string;
}

export function TaskList({ projectId }: TaskListProps): React.JSX.Element {
  const { store } = useDataLayer();
  const taskIds = useTopLevelTasksReactive(store, projectId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addTask(): void {
    createTask(store, { title: NEW_TASK_TITLE, projectId });
  }

  if (taskIds.length === 0) {
    return (
      <section className="tasks" aria-label="Tasks">
        <header className="tasks-header">
          <h3>Tasks</h3>
          <button type="button" className="btn" onClick={addTask}>
            + Task
          </button>
        </header>
        <p className="placeholder">No tasks yet.</p>
      </section>
    );
  }

  return (
    <section className="tasks" aria-label="Tasks">
      <header className="tasks-header">
        <h3>Tasks</h3>
        <button type="button" className="btn" onClick={addTask}>
          + Task
        </button>
      </header>
      <ul className="task-list">
        {taskIds.map((id) => (
          <TaskItem
            key={id}
            id={id}
            projectId={projectId}
            depth={0}
            expanded={expanded}
            onToggle={toggle}
          />
        ))}
      </ul>
    </section>
  );
}

interface TaskItemProps {
  id: string;
  projectId: string;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}

function TaskItem({ id, projectId, depth, expanded, onToggle }: TaskItemProps): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const task = useTaskReactive(store, id);
  const childIds = useChildTasksReactive(store, id);
  if (!task) return <></>;

  const isOpen = expanded.has(id);
  const done = task.status === TASK_STATUS.done;
  const hasChildren = childIds.length > 0;

  function addSubTask(): void {
    const child = createTask(store, { title: NEW_TASK_TITLE, projectId, parentTaskId: id });
    onToggle(id);
    void child;
  }

  return (
    <li className="task-item">
      <div
        className={`task-row${done ? ' task-row-done' : ''}`}
        style={{ paddingInlineStart: `${depth * 18}px` }}
      >
        <button
          type="button"
          className="task-caret"
          onClick={() => onToggle(id)}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
          disabled={!hasChildren}
        >
          {hasChildren ? (isOpen ? '▾' : '▸') : ''}
        </button>
        <input
          type="checkbox"
          className="task-checkbox"
          checked={done}
          onChange={() =>
            setTaskStatus(store, id, done ? TASK_STATUS.open : TASK_STATUS.done)
          }
          aria-label={done ? 'Mark not done' : 'Mark done'}
        />
        <input
          className={`task-title${done ? ' task-title-done' : ''}`}
          value={task.title}
          onChange={(e) => updateTask(store, id, { title: e.target.value })}
          aria-label="Task title"
        />
        <span className="task-actions">
          <button type="button" className="btn btn-ghost" title="Add sub-task" onClick={addSubTask}>
            +
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            title="Open task"
            onClick={() => navigate({ kind: 'task', id })}
          >
            →
          </button>
          <ConfirmButton onConfirm={() => deleteTask(store, id)} />
        </span>
      </div>
      {isOpen && hasChildren && (
        <ul className="task-list">
          {childIds.map((cid) => (
            <TaskItem
              key={cid}
              id={cid}
              projectId={projectId}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function useTopLevelTasksReactive(store: MergeableStore, projectId: string): string[] {
  // Subscribe to the tasks table so the list re-renders on add/remove/reorder.
  const allIds = useTableRowIds(store, TABLES.tasks);
  return getTasksForProject(store, projectId).filter((id) => allIds.includes(id));
}

function useChildTasksReactive(store: MergeableStore, parentTaskId: string): string[] {
  const allIds = useTableRowIds(store, TABLES.tasks);
  return getChildTasks(store, parentTaskId).filter((id) => allIds.includes(id));
}

function useTaskReactive(
  store: MergeableStore,
  id: string,
): { title: string; status: TaskStatus } | undefined {
  const row = useRow(TABLES.tasks, id, store);
  if (!row || Object.keys(row).length === 0) return undefined;
  return {
    title: String(row[COLUMNS.tasks.title] ?? ''),
    status: String(row[COLUMNS.tasks.status] ?? TASK_STATUS.open) as TaskStatus,
  };
}

/** Subscribe to a table's row-id list (re-renders on add/remove). */
function useTableRowIds(store: MergeableStore, table: string): string[] {
  return useRowIds(table, store);
}