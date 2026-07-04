/**
 * Right-pane detail view for a single Task (selected from the list or via a
 * deep link). Shows the title, status toggle, move controls (re-parent to
 * another project or another task), the sub-task list, and notes.
 */

import { useRow } from 'tinybase/ui-react';
import {
  useDataLayer,
  updateTask,
  deleteTask,
  setTaskStatus,
  getProject,
  COLUMNS,
  TABLES,
  TASK_STATUS,
} from '../data/index.ts';
import type { TaskStatus } from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import { EditableTitle } from './EditableTitle.tsx';
import { ConfirmButton } from './ConfirmButton.tsx';
import { TaskList } from './TaskList.tsx';
import { NotesPanel } from './NotesPanel.tsx';

export function TaskDetail({ id }: { id: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const task = useTaskReactive(store, id);
  if (!task) return <></>;

  const done = task.status === TASK_STATUS.done;
  const projectIds = store.getRowIds(TABLES.projects);

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
        <ConfirmButton onConfirm={remove} title="Delete task" />
      </div>

      <div className="entity-meta">
        <label className="field">
          <span className="field-label">Project</span>
          <select
            className="field-select"
            value={task.projectId ?? ''}
            onChange={(e) => updateTask(store, id, { projectId: e.target.value, parentTaskId: null })}
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
      </div>

      {task.projectId && <TaskList projectId={task.projectId} />}
      <NotesPanel entityType="task" entityId={id} />
    </div>
  );
}

function useTaskReactive(
  store: ReturnType<typeof useDataLayer>['store'],
  id: string,
): { title: string; status: TaskStatus; projectId: string | null; parentTaskId: string | null } | undefined {
  const row = useRow(TABLES.tasks, id, store);
  if (!row || Object.keys(row).length === 0) return undefined;
  const projectId = row[COLUMNS.tasks.projectId];
  const parentTaskId = row[COLUMNS.tasks.parentTaskId];
  return {
    title: String(row[COLUMNS.tasks.title] ?? ''),
    status: String(row[COLUMNS.tasks.status] ?? TASK_STATUS.open) as TaskStatus,
    projectId: projectId === undefined || projectId === null || projectId === '' ? null : String(projectId),
    parentTaskId:
      parentTaskId === undefined || parentTaskId === null || parentTaskId === ''
        ? null
        : String(parentTaskId),
  };
}