/**
 * The undo toast: a quiet surface pill pinned bottom-center announcing a
 * reversible action, with Undo as its single action. `role="status"`
 * makes it an aria-live polite region, so its label is announced when it
 * appears without stealing focus. The provider pauses auto-dismiss while
 * the pointer or focus is inside (`onPause`/`onResume`).
 */
export default function UndoToast({
  label,
  onUndo,
  onPause,
  onResume,
}: {
  label: string;
  onUndo: () => void;
  onPause: () => void;
  onResume: () => void;
}): React.JSX.Element {
  return (
    <div
      className="undo-toast"
      role="status"
      onPointerEnter={onPause}
      onPointerLeave={onResume}
      onFocusCapture={onPause}
      onBlurCapture={onResume}
    >
      <span className="undo-toast-label">{label}</span>
      <button type="button" className="undo-toast-action" onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}
