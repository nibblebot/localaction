import { useState } from 'react';
import {
  useDataLayer,
  updateTask,
  deleteTask,
  setTaskStatus,
  useTask,
  getProject,
  getChildTasks,
  getTasksForProject,
  TABLES,
  COLUMNS,
  TASK_STATUS,
} from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import EditableTitle from './EditableTitle.tsx';
import ConfirmModal from './ConfirmModal.tsx';
import TaskList from './TaskList.tsx';
import EntityNote from './EntityNote.tsx';

export default function TaskDetail({ id }: { id: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const task = useTask(store, id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!task) return <></>;

  const done = task.status === TASK_STATUS.done;
  const projectIds = store.getRowIds(TABLES.projects);
  const siblingIds = task.projectId
    ? getTasksForProject(store, task.projectId).filter((tid) => tid !== id)
    : [];
  const descendantIds = new Set(collectDescendants(store, id));

  function remove(): void {
    deleteTask(store, id);
    navigate({ kind: 'home' });
  }

  return (
    <div className="entity-editor">
      <div className="entity-editor-head">
        <label className="task-status-toggle">
          <input
            type="checkbox"
            checked={done}
            onChange={() =>
              setTaskStatus(store, id, done ? TASK_STATUS.open : TASK_STATUS.done)
            }
          />
        </label>
        <EditableTitle
          value={task.title}
          onCommit={(next) => updateTask(store, id, { title: next })}
          placeholder="Task title"
        />
        <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
          Delete
        </button>
      </div>

      <div className="entity-meta">
        <label className="field">
          <span className="field-label">Project</span>
          <select
            className="field-select"
            value={task.projectId ?? ''}
            onChange={(e) =>
              updateTask(store, id, { projectId: e.target.value, parentTaskId: null })
            }
          >
            {projectIds.map((pid) => {
              const p = getProject(store, pid);
              if (!p) return null;
              return (
                <option key={pid} value={pid}>
                  {p.name || 'Untitled'}
                </option>
              );
            })}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Parent task</span>
          <select
            className="field-select"
            value={task.parentTaskId ?? ''}
            onChange={(e) => updateTask(store, id, { parentTaskId: e.target.value || null })}
          >
            <option value="">(Top level)</option>
            {siblingIds
              .filter((tid) => !descendantIds.has(tid))
              .map((tid) => (
                <option key={tid} value={tid}>
                  {getTaskTitle(store, tid)}
                </option>
              ))}
          </select>
        </label>
      </div>

      {task.projectId && <TaskList projectId={task.projectId} />}
      <EntityNote entityType="task" entityId={id} />

      <ConfirmModal
        open={confirmDelete}
        title="Delete task?"
        message={`“${task.title || 'Untitled'}” will be deleted. Sub-tasks will become orphans.`}
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function getTaskTitle(
  store: ReturnType<typeof useDataLayer>['store'],
  id: string,
): string {
  const row = store.getRow(TABLES.tasks, id);
  return String(row[COLUMNS.tasks.title] ?? 'Untitled');
}

function collectDescendants(
  store: ReturnType<typeof useDataLayer>['store'],
  rootId: string,
): string[] {
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const child of getChildTasks(store, cur)) {
      out.push(child);
      stack.push(child);
    }
  }
  return out;
}
