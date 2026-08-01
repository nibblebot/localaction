import { useDataLayer, updateTask, useTask } from '../../data/index.ts';
import DueDateButton from '../due/DueDateButton.tsx';

/** Due-date control for a task row (see `DueDateButton`). */
export default function TaskDueDateButton({
  taskId,
}: {
  taskId: string;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const task = useTask(store, taskId);
  return (
    <DueDateButton
      dueDate={task?.dueDate ?? null}
      onChange={(iso) => updateTask(store, taskId, { dueDate: iso })}
      className="task-line-action"
    />
  );
}
