/**
 * Completed-task visibility toggle, shared by the area toolbar and the
 * inbox header. Renders active (accent tint) while done tasks show in
 * place.
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
