import type { ReactNode } from 'react';

/**
 * Top-level area-view section (Tasks / Projects / Notes) with a
 * collapsible header. Header chrome reuses the `.tab-group-*` label
 * styles so sections read like the inner ACTIVE / DONE groups, one
 * register up.
 */
function CollapsibleSection({
  title,
  icon,
  count,
  collapsed,
  onToggleCollapse,
  trailing,
  children,
}: {
  title: string;
  /** Icon sprite symbol id (without the `-icon` suffix) shown before the title. */
  icon?: string;
  count: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Extra action pinned to the header's right edge. */
  trailing?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <section className="pane-section" aria-label={title}>
      <div className="pane-section-head">
        <button
          type="button"
          className="pane-section-toggle"
          aria-expanded={!collapsed}
          title={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          onClick={onToggleCollapse}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href={`/icons.svg#${collapsed ? 'chevron-right-icon' : 'chevron-down-icon'}`} />
          </svg>
          {icon && (
            <svg className="svg-icon pane-section-icon" aria-hidden="true">
              <use href={`/icons.svg#${icon}-icon`} />
            </svg>
          )}
          <span className="pane-section-title">{title}</span>
          <span className="tab-group-count">{count}</span>
        </button>
        {trailing}
      </div>
      {!collapsed && children}
    </section>
  );
}

export default CollapsibleSection;
