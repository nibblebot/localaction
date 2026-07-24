/**
 * Titled section wrapper used by tab content (projects, tasks, notes).
 * Children render inside a plain <ul>; each child supplies its own
 * row chrome.
 */
export default function Group({
  title,
  count,
  collapsed,
  onToggleCollapse,
  children,
}: {
  /** Status-partition label (Active / Backlog / Done / Area tasks).
   * Omitted when the group partitions nothing — a section holding a
   * single status scope renders its rows directly, with no redundant
   * second label between the section header and the rows. */
  title?: string;
  count?: number;
  /** Collapse state; both props together turn the header into a
   * toggle that hides the group's rows. Pure view state. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const collapsible = title !== undefined && onToggleCollapse !== undefined;
  return (
    <div className="tab-group">
      {title !== undefined && (
        <header className="tab-group-head">
          {collapsible ? (
            <button
              type="button"
              className="tab-group-toggle"
              aria-expanded={!collapsed}
              title={collapsed ? `Expand ${title}` : `Collapse ${title}`}
              onClick={onToggleCollapse}
            >
              <svg className="svg-icon" aria-hidden="true">
                <use href={`/icons.svg#${collapsed ? 'chevron-right-icon' : 'chevron-down-icon'}`} />
              </svg>
              <span className="tab-group-title">{title}</span>
              <span className="tab-group-count">· {count}</span>
            </button>
          ) : (
            <>
              <span className="tab-group-title">{title}</span>
              <span className="tab-group-count">· {count}</span>
            </>
          )}
        </header>
      )}
      {!collapsed && (
        <ul className="tab-group-list" role="list">
          {children}
        </ul>
      )}
    </div>
  );
}
