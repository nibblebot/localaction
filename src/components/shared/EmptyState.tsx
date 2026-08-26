/**
 * The empty-/welcome-state shell shared by every main-pane route when it has
 * nothing to render: a no-area welcome, or a deleted-task placeholder. The
 * outer `<main>`/`.main-body` chrome matches the populated panes so the layout
 * never collapses around the empty state.
 */
export default function EmptyState({
  title = 'Welcome to LocalAction',
  message,
  ariaLabel = 'Editor',
}: {
  title?: string;
  message: string;
  ariaLabel?: string;
}): React.JSX.Element {
  return (
    <main className="main" aria-label={ariaLabel}>
      <div className="main-body">
        <div className="main-empty">
          <h2>{title}</h2>
          <p>{message}</p>
        </div>
      </div>
    </main>
  );
}
