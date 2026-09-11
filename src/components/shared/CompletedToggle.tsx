/**
 * Completed-task visibility toggle, shared by the area header and the
 * task detail pane header. Renders active (accent tint) while completed
 * tasks show; off hides the Done group and every completed row.
 */
function CompletedToggle({
  showCompleted,
  onToggle,
}: {
  showCompleted: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`area-tab-action icon-button${showCompleted ? ' area-tab-action-active' : ''}`}
      aria-label={showCompleted ? 'Hide completed tasks' : 'Show completed tasks'}
      title={showCompleted ? 'Hide completed tasks' : 'Show completed tasks'}
      aria-pressed={showCompleted}
      onClick={onToggle}
    >
      <svg className="svg-icon" aria-hidden="true">
        <use href="/icons.svg#check-icon" />
      </svg>
    </button>
  );
}

export default CompletedToggle;
