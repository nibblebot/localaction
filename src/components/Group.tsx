/**
 * Titled section wrapper used by tab content (projects, tasks, notes).
 * Children render inside a plain <ul>; each child supplies its own
 * row chrome.
 */
export default function Group({
  title,
  count,
  children,
}: {
  /** Status-partition label (Active / Done / Area tasks). Omitted when
   * the group partitions nothing — a section holding a single status
   * scope renders its rows directly, with no redundant second label
   * between the section header and the rows. */
  title?: string;
  count?: number;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="tab-group">
      {title !== undefined && (
        <header className="tab-group-head">
          <span className="tab-group-title">{title}</span>
          <span className="tab-group-count">· {count}</span>
        </header>
      )}
      <ul className="tab-group-list" role="list">
        {children}
      </ul>
    </div>
  );
}
