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
  trailing,
  dropRef,
  dropActive,
  dropOver,
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
  /** Action pinned next to the title (e.g. an add button). */
  trailing?: React.ReactNode;
  /** Droppable header: ref from useDroppable, `dropActive` while a
   * drag is in flight, `dropOver` when the dragged row hovers. */
  dropRef?: (node: HTMLElement | null) => void;
  dropActive?: boolean;
  dropOver?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const collapsible = title !== undefined && onToggleCollapse !== undefined;
  const headClasses = ['tab-group-head'];
  if (dropActive) headClasses.push('tab-group-head-drop-target');
  if (dropOver) headClasses.push('tab-group-head-drop-over');
  return (
    <div className="tab-group">
      {title !== undefined && (
        <header ref={dropRef} className={headClasses.join(' ')}>
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
          {trailing}
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
