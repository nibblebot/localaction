import { useDataLayer, useTask, setTaskStatus, TASK_STATUS } from '../../data/index.ts';
import { useUndo } from '../context/useUndo.ts';
import { weekdayWithDate } from '../shared/dates.ts';

/**
 * Flat, read-only task list for cross-cutting views (due panes, completed
 * history). Rows show a working checkbox, a plain (non-editable) title,
 * and an optional static due-date label — no row actions, no drag, no
 * subtree chrome. Unlike the editable TaskTree, this renders exactly the
 * ids it's given, flat.
 */
export default function ReadOnlyTaskList({
  ids,
  showDueDate,
}: {
  ids: readonly string[];
  /** Render a static date label after the title (cross-day views). */
  showDueDate?: boolean;
}): React.JSX.Element {
  return (
    <ul className="task-list">
      {ids.map((tid) => (
        <li key={tid}>
          <ReadOnlyTaskRow taskId={tid} showDueDate={showDueDate} />
        </li>
      ))}
    </ul>
  );
}

function ReadOnlyTaskRow({
  taskId,
  showDueDate,
}: {
  taskId: string;
  showDueDate?: boolean;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const task = useTask(store, taskId);
  const { offerUndo } = useUndo();
  if (!task) return null;
  const done = task.status === TASK_STATUS.done;

  const classes = ['task-line'];
  if (done) classes.push('task-line-done');

  return (
    <div className={classes.join(' ')}>
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
      <span className="task-line-title">{task.title}</span>
      {showDueDate && task.dueDate && (
        <span className="task-line-due-date" aria-label={`Due ${weekdayWithDate(task.dueDate)}`}>
          {weekdayWithDate(task.dueDate)}
        </span>
      )}
    </div>
  );
}
