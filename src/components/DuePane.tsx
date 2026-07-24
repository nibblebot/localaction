import { useMemo } from 'react';
import {
  useDataLayer,
  useAreaCounts,
  useProjectRollups,
  useDueItems,
  areaColorHex,
} from '../data/index.ts';
import type { DueItem } from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import { useCollapsedSet } from './useCollapsedSet.ts';
import { TaskList } from './TaskList.tsx';
import ProjectTaskList from './ProjectTaskList.tsx';
import type { AreaColorId } from '../data/colors.ts';

interface DueProjectGroup {
  projectId: string | null;
  projectName: string;
  order: number;
  /** True when the project itself is due in the range (rendered as a project row). */
  projectDue: boolean;
  taskIds: string[];
}

interface DueAreaGroup {
  areaId: string | null;
  name: string;
  color: AreaColorId;
  order: number;
  projects: DueProjectGroup[];
}

/**
 * Group flat due items into Area → Project buckets. The Inbox
 * (`areaId` null) sorts first; areas and projects keep their sidebar
 * `order`. A project appears as its own bucket when it is due in the
 * range or any of its tasks are; area-level tasks sit in the
 * `projectId: null` bucket.
 */
function groupDueItems(
  items: readonly DueItem[],
  areaMeta: ReadonlyMap<string, { name: string; color: AreaColorId; order: number }>,
  projectMeta: ReadonlyMap<string, { name: string; order: number }>,
): DueAreaGroup[] {
  const areas = new Map<string | null, DueAreaGroup>();
  const areaFor = (areaId: string | null): DueAreaGroup => {
    const existing = areas.get(areaId);
    if (existing) return existing;
    const meta = areaId === null ? null : areaMeta.get(areaId);
    const group: DueAreaGroup = {
      areaId,
      name: areaId === null ? 'Inbox' : meta?.name || 'Untitled',
      color: meta?.color ?? 'gray',
      order: areaId === null ? -1 : (meta?.order ?? 0),
      projects: [],
    };
    areas.set(areaId, group);
    return group;
  };
  const projectFor = (area: DueAreaGroup, projectId: string | null): DueProjectGroup => {
    const existing = area.projects.find((p) => p.projectId === projectId);
    if (existing) return existing;
    const meta = projectId === null ? null : projectMeta.get(projectId);
    const group: DueProjectGroup = {
      projectId,
      projectName: meta?.name || 'Untitled',
      order: projectId === null ? -1 : (meta?.order ?? 0),
      projectDue: false,
      taskIds: [],
    };
    area.projects.push(group);
    return group;
  };
  for (const item of items) {
    const area = areaFor(item.areaId);
    if (item.kind === 'project') {
      projectFor(area, item.id).projectDue = true;
    } else {
      projectFor(area, item.projectId).taskIds.push(item.id);
    }
  }
  const sorted = [...areas.values()].sort((a, b) =>
    a.order !== b.order ? a.order - b.order : a.name.localeCompare(b.name),
  );
  for (const area of sorted) {
    area.projects.sort((a, b) =>
      a.order !== b.order ? a.order - b.order : a.projectName.localeCompare(b.projectName),
    );
  }
  return sorted;
}

/** A project that is due in the current range — a link row into its
 * area. When `onToggleCollapse` is given (the Today view, where the
 * project's task tree renders below), a caret toggles that tree. */
function ProjectDueRow({
  areaId,
  name,
  badgeLabel,
  collapsed,
  onToggleCollapse,
}: {
  areaId: string | null;
  name: string;
  badgeLabel: string;
  /** Tree-collapsed state; required with `onToggleCollapse`. */
  collapsed?: boolean;
  /** When set, the row gains a caret that toggles the task tree. */
  onToggleCollapse?: () => void;
}): React.JSX.Element {
  const { navigate } = useSelection();
  const link = (
    <button
      type="button"
      className="today-project-due"
      onClick={() => areaId && navigate({ kind: 'area', id: areaId })}
      aria-label={`Project ${name} ${badgeLabel.toLowerCase()}`}
    >
      <svg className="svg-icon" aria-hidden="true">
        <use href="/icons.svg#project-list-icon" />
      </svg>
      <span className="today-project-due-name">{name}</span>
      <span className="today-due-badge">{badgeLabel}</span>
    </button>
  );
  if (!onToggleCollapse) return link;
  return (
    <div className="today-project-due-row">
      <button
        type="button"
        className="project-row-caret"
        aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand tasks' : 'Collapse tasks'}
        onClick={onToggleCollapse}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href={`/icons.svg#${collapsed ? 'chevron-right-icon' : 'chevron-down-icon'}`} />
        </svg>
      </button>
      {link}
    </div>
  );
}

/**
 * Shared body for the Today and Week views. The range filtering and
 * header differ — `from === to` is the single-day Today view (the
 * title-bar badge collapses to "Due today"): there, a project whose
 * own due date falls in range expands its full task tree in place via
 * the same `ProjectTaskList` the project detail pane uses. A wider
 * range shows one cross-cutting project-due link row per project and
 * per-row weekday labels.
 */
export default function DuePane({
  title,
  from,
  to,
  storageKey,
  projectBadgeLabel,
}: {
  title: string;
  /** Inclusive local-date ISO (`YYYY-MM-DD`) range start. */
  from: string;
  /** Inclusive local-date ISO (`YYYY-MM-DD`) range end. */
  to: string;
  /** LocalStorage key for collapse state (Done section, due-project trees). */
  storageKey: string;
  /** Label rendered on project-due rows (e.g. "Due today" or "Due this week"). */
  projectBadgeLabel: string;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const items = useDueItems(store, from, to);
  const counts = useAreaCounts(store);
  const rollups = useProjectRollups(store);
  const { collapsed, toggle } = useCollapsedSet(storageKey);

  const open = useMemo(() => items.filter((i) => !i.done), [items]);
  const doneTaskIds = useMemo(
    () => items.filter((i) => i.done && i.kind === 'task').map((i) => i.id),
    [items],
  );

  const groups = useMemo(() => {
    const areaMeta = new Map(counts.map((c) => [c.id, { name: c.name, color: c.color, order: c.order }]));
    const projectMeta = new Map(rollups.map((r) => [r.projectId, { name: r.projectName, order: r.order }]));
    return groupDueItems(open, areaMeta, projectMeta);
  }, [open, counts, rollups]);

  const doneCollapsed = collapsed.has('done');
  const showRowDates = from !== to;
  /** Single-day Today view: due projects expand their full task tree. */
  const expandDueProjects = from === to;

  return (
    <main className="main" aria-label={title}>
      <div className="main-body">
        <header className="main-pane-header">
          <h2 className="main-pane-title">{title}</h2>
        </header>
        {groups.length === 0 && doneTaskIds.length === 0 ? (
          <p className="today-empty">Nothing in this view.</p>
        ) : (
          groups.map((area) => (
            <section
              key={area.areaId ?? 'inbox'}
              className="today-group"
              aria-label={`${area.name} items in ${title.toLowerCase()}`}
            >
              <h3 className="today-group-title">
                {area.areaId !== null && (
                  <span
                    className="sidebar-item-dot"
                    style={{ background: areaColorHex(area.color) }}
                    aria-hidden="true"
                  />
                )}
                {area.name}
              </h3>
              {area.projects.map((project) => {
                const projectId = project.projectId;
                return (
                <div key={projectId ?? 'area-tasks'} className="today-project">
                  {projectId !== null && !project.projectDue && (
                    <h4 className="today-project-title">{project.projectName}</h4>
                  )}
                  {project.projectDue && projectId !== null && (
                    <ProjectDueRow
                      areaId={area.areaId}
                      name={project.projectName}
                      badgeLabel={projectBadgeLabel}
                      collapsed={collapsed.has(projectId)}
                      onToggleCollapse={
                        expandDueProjects ? () => toggle(projectId) : undefined
                      }
                    />
                  )}
                  {project.projectDue &&
                  projectId !== null &&
                  expandDueProjects &&
                  !collapsed.has(projectId) ? (
                    // Today: the full editable tree (same as the project
                    // detail pane) supersedes the read-only due-task rows.
                    <div className="project-row-tasks">
                      <ProjectTaskList
                        projectId={projectId}
                        projectName={project.projectName}
                        showCompleted={false}
                        hideEmptySections
                      />
                    </div>
                  ) : (
                    project.taskIds.length > 0 && (
                      <TaskList
                        ids={project.taskIds}
                        readOnly
                        effectiveStatus
                        showDueDate={showRowDates}
                      />
                    )
                  )}
                </div>
                );
              })}
            </section>
          ))
        )}
        {doneTaskIds.length > 0 && (
          <section className="today-group today-done" aria-label="Done">
            <button
              type="button"
              className="today-done-toggle"
              aria-expanded={!doneCollapsed}
              onClick={() => toggle('done')}
            >
              <svg className="svg-icon" aria-hidden="true">
                <use
                  href={`/icons.svg#${doneCollapsed ? 'chevron-right-icon' : 'chevron-down-icon'}`}
                />
              </svg>
              <h3 className="today-group-title">Done</h3>
              <span className="sidebar-link-count">{doneTaskIds.length}</span>
            </button>
            {!doneCollapsed && (
              <TaskList
                ids={doneTaskIds}
                readOnly
                effectiveStatus
                showDueDate={showRowDates}
              />
            )}
          </section>
        )}
      </div>
    </main>
  );
}
