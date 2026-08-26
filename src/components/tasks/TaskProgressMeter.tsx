import { useDataLayer, useSubtreeProgress } from '../../data/index.ts';

/**
 * Done/total progress meter for a parent task row — the row's whole
 * subtree derived-completion (`done` of `total` descendants), fed by
 * the data layer's `useSubtreeProgress`. Rendered wherever a task with
 * subtasks appears instead of a checkbox: area view, inbox, detail
 * panes, due panes. Reuses the `.project-row-progress*` classes so the
 * meter inherits the existing bar styling with no new CSS.
 */
export default function TaskProgressMeter({
  taskId,
}: {
  taskId: string;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const { done, total } = useSubtreeProgress(store, taskId);
  if (total === 0) return null;
  return (
    <div className="project-row-progress" aria-label={`${done} of ${total} subtasks done`}>
      <div className="project-row-progress-bar">
        <div
          className="project-row-progress-fill"
          style={{ transform: `scaleX(${Math.round((done / total) * 100) / 100})` }}
        />
      </div>
      <span className="project-row-progress-count">
        {done} / {total}
      </span>
    </div>
  );
}
