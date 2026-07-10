import { useEffect, useRef, useState } from 'react';
import {
  useDataLayer,
  createTask,
  updateTask,
  deleteTask,
  setTaskStatus,
  useTasks,
  useChildTasks,
  useTask,
  isTaskOrphaned,
  TASK_STATUS,
} from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import ConfirmButton from './ConfirmButton.tsx';
import NoteIndicator from './NoteIndicator.tsx';

const NEW_TASK_TITLE = 'New task';

export interface TaskListProps {
  projectId: string;
}

export default function TaskList({ projectId }: TaskListProps): React.JSX.Element {
  const { store } = useDataLayer();
  const taskIds = useTasks(store, projectId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);

  function toggle(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addTask(): void {
    const id = createTask(store, { title: NEW_TASK_TITLE, projectId });
    setJustCreatedId(id);
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
            justCreatedId={justCreatedId}
            onFocused={() => setJustCreatedId(null)}
            onAddSubTask={setJustCreatedId}
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
  justCreatedId: string | null;
  onFocused: () => void;
  onAddSubTask: (id: string) => void;
}

function TaskItem({ id, projectId, depth, expanded, onToggle, justCreatedId, onFocused, onAddSubTask }: TaskItemProps): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const task = useTask(store, id);
  const childIds = useChildTasks(store, id);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (justCreatedId === id && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
      onFocused();
    }
  }, [justCreatedId, id, onFocused]);
  if (!task) return <></>;

  const isOpen = expanded.has(id);
  const done = task.status === TASK_STATUS.done;
  const hasChildren = childIds.length > 0;
  const orphaned = isTaskOrphaned(store, id);

  function addSubTask(): void {
    const child = createTask(store, { title: NEW_TASK_TITLE, projectId, parentTaskId: id });
    onToggle(id);
    onAddSubTask?.(child);
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
          {hasChildren ? (
            <svg className="task-caret-icon" aria-hidden="true">
              <use href={isOpen ? '/icons.svg#caret-down-icon' : '/icons.svg#caret-right-icon'} />
            </svg>
          ) : null}
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
          ref={titleRef}
          className={`task-title${done ? ' task-title-done' : ''}`}
          value={task.title}
          onChange={(e) => updateTask(store, id, { title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          aria-label="Task title"
        />
        <NoteIndicator entityType="task" entityId={id} />
        {orphaned && <span className="pill pill-orphan">Orphaned</span>}
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
              justCreatedId={justCreatedId}
              onFocused={onFocused}
              onAddSubTask={onAddSubTask}
            />
          ))}
        </ul>
      )}
    </li>
  );
}