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
  title: string;
  count: number;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="tab-group">
      <header className="tab-group-head">
        <span className="tab-group-title">{title}</span>
        <span className="tab-group-count">· {count}</span>
      </header>
      <ul className="tab-group-list" role="list">
        {children}
      </ul>
    </div>
  );
}
