import { useMemo } from 'react';
import {
  useDataLayer,
  useAreaCounts,
  useDueItems,
  useCompletedItemsInRange,
  useTask,
  areaColorHex,
  moveTask,
  childTaskIds,
  sortTaskIds,
  useTableVersion,
  PLACEMENT_SEP,
  COLUMNS,
  TABLES,
} from '../../data/index.ts';
import type { MergeableStore } from 'tinybase';
import type { CompletedItem, DueItem } from '../../data/index.ts';
import { useSelection } from '../context/useSelection.ts';
import { useCollapsedSet } from '../hooks/useCollapsedSet.ts';
import { todayIso, weekdayWithDate } from '../shared/dates.ts';
import ReadOnlyTaskList from '../tasks/ReadOnlyTaskList.tsx';
import TaskTree from '../tasks/TaskTree.tsx';
import type { AreaColorId } from '../../data/colors.ts';

interface DueRootGroup {
  /** The owning root task every due item in this bucket rolls up to. */
  rootTaskId: string;
  order: number;
  /** True when the root task itself is due in the range (rendered as a root row). */
  rootDue: boolean;
  /** Due sub-tasks under the root (the root itself is never listed here). */
  taskIds: string[];
}

interface DueAreaGroup {
  areaId: string | null;
  name: string;
  color: AreaColorId;
  order: number;
  roots: DueRootGroup[];
}

/**
 * Group flat due items into Area → Root-task buckets. The Inbox
 * (`areaId` null) sorts first; areas and roots keep their `order`. A root
 * task appears as its own bucket when it is due in the range or any of its
 * sub-tasks are; a root that's itself due is flagged `rootDue` (its own id
 * never lands in `taskIds`).
 */
function groupDueItems(
  store: MergeableStore,
  items: readonly DueItem[],
  areaMeta: ReadonlyMap<string, { name: string; color: AreaColorId; order: number }>,
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
      roots: [],
    };
    areas.set(areaId, group);
    return group;
  };
  const rootFor = (area: DueAreaGroup, rootTaskId: string): DueRootGroup => {
    const existing = area.roots.find((r) => r.rootTaskId === rootTaskId);
    if (existing) return existing;
    const order = Number(store.getCell(TABLES.tasks, rootTaskId, COLUMNS.tasks.order) ?? 0);
    const group: DueRootGroup = { rootTaskId, order, rootDue: false, taskIds: [] };
    area.roots.push(group);
    return group;
  };
  for (const item of items) {
    const area = areaFor(item.areaId);
    const root = rootFor(area, item.rootTaskId);
    if (item.id === item.rootTaskId) root.rootDue = true;
    else root.taskIds.push(item.id);
  }
  const sorted = [...areas.values()].sort((a, b) =>
    a.order !== b.order ? a.order - b.order : a.name.localeCompare(b.name),
  );
  for (const area of sorted) {
    area.roots.sort((a, b) => a.order !== b.order ? a.order - b.order : a.rootTaskId.localeCompare(b.rootTaskId));
  }
  return sorted;
}

/** A root task's title, read at render time. */
function RootTaskTitle({ rootTaskId }: { rootTaskId: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const task = useTask(store, rootTaskId);
  return <>{task?.title || 'Untitled'}</>;
}

/** The subtree of a due root, rendered inline: the root's direct
 * children become the tree's roots (the root itself is the link row
 * above), so the full descendant tree shows without duplicating the
 * root row. */
function DueRootSubtree({
  rootTaskId,
  onMove,
}: {
  rootTaskId: string;
  onMove: (activeId: string, parentId: string | null, beforeId: string | undefined) => void;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const v = useTableVersion(store, TABLES.tasks);
  const childIds = useMemo(() => {
    void v; // invalidation token
    return sortTaskIds(store, childTaskIds(store, rootTaskId));
  }, [store, v, rootTaskId]);
  return <TaskTree rootIds={childIds} onMove={onMove} />;
}

/** A root task that is due in the current range — a link row into its
 * task pane. When `onToggleCollapse` is given (the Today view, where the
 * root's subtree renders below), a caret toggles that subtree. */
function RootTaskDueRow({
  rootTaskId,
  badgeLabel,
  collapsed,
  onToggleCollapse,
}: {
  rootTaskId: string;
  badgeLabel: string;
  /** Tree-collapsed state; required with `onToggleCollapse`. */
  collapsed?: boolean;
  /** When set, the row gains a caret that toggles the subtree. */
  onToggleCollapse?: () => void;
}): React.JSX.Element {
  const { navigate } = useSelection();
  const link = (
    <button
      type="button"
      className="today-project-due"
      onClick={() => navigate({ kind: 'task', id: rootTaskId })}
      aria-label={`Task due ${badgeLabel.toLowerCase()}`}
    >
      <svg className="svg-icon" aria-hidden="true">
        <use href="/icons.svg#tasks-icon" />
      </svg>
      <span className="today-project-due-name">
        <RootTaskTitle rootTaskId={rootTaskId} />
      </span>
      <span className="today-due-badge">{badgeLabel}</span>
    </button>
  );
  if (!onToggleCollapse) return link;
  return (
    <div className="today-project-due-row">
      <button
        type="button"
        className="project-row-caret icon-button"
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand subtasks' : 'Collapse subtasks'}
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
 * Shared body for the Today and Week views. The range filtering and header
 * differ — `from === to` is the single-day Today view (the title-bar badge
 * collapses to "Due today"): there, a root task whose own due date falls in
 * range expands its full subtree in place via the shared `TaskTree`. A wider
 * range shows one cross-cutting root-due link row per root and per-row
 * weekday labels.
 */
export default function DuePane({
  title,
  from,
  to,
  storageKey,
  dueBadgeLabel,
}: {
  title: string;
  /** Inclusive local-date ISO (`YYYY-MM-DD`) range start. */
  from: string;
  /** Inclusive local-date ISO (`YYYY-MM-DD`) range end. */
  to: string;
  /** LocalStorage key for collapse state (Done section, due-root trees). */
  storageKey: string;
  /** Label rendered on root-due rows (e.g. "Due today" or "Due this week"). */
  dueBadgeLabel: string;
}): React.JSX.Element {
  const { store } = useDataLayer();
  // The query range reaches back to the ISO floor so past-due items are
  // fetched too; they split into the Overdue section below.
  const items = useDueItems(store, '0000-01-01', to);
  const counts = useAreaCounts(store);
  const { collapsed, toggle } = useCollapsedSet(storageKey);
  const { collapsed: collapsedDays, toggle: toggleDay } = useCollapsedSet(`${storageKey}:days`);

  const today = todayIso();
  const open = useMemo(() => items.filter((i) => !i.done), [items]);
  /** Open items whose due date has already passed — lifted out of the
   * range groups into the Overdue section. Same definition in both
   * views: anything due before today. */
  const overdue = useMemo(() => open.filter((i) => i.dueDate < today), [open, today]);
  const overdueTaskIds = useMemo(() => overdue.map((i) => i.id), [overdue]);
  const inRange = useMemo(() => open.filter((i) => i.dueDate >= today), [open, today]);
  const completed = useCompletedItemsInRange(store, from, to);
  const doneByDay = useMemo(() => {
    const buckets = new Map<string, CompletedItem[]>();
    for (const item of completed) {
      const bucket = buckets.get(item.localDay);
      if (bucket) bucket.push(item);
      else buckets.set(item.localDay, [item]);
    }
    return buckets;
  }, [completed]);

  const groups = useMemo(() => {
    const areaMeta = new Map(counts.map((c) => [c.id, { name: c.name, color: c.color, order: c.order }]));
    return groupDueItems(store, inRange, areaMeta);
  }, [store, inRange, counts]);

  const overdueCollapsed = collapsed.has('overdue');
  const doneCollapsed = collapsed.has('done');
  const showRowDates = from !== to;
  /** Single-day Today view: due root tasks expand their full subtree. */
  const expandDueRoots = from === to;

  function onMove(
    activeId: string,
    parentId: string | null,
    beforeId: string | undefined,
  ): void {
    moveTask(
      store,
      activeId,
      parentId ? `task${PLACEMENT_SEP}${parentId}` : null,
      beforeId,
    );
  }

  return (
    <main className="main" aria-label={title}>
      <div className="main-body">
        <header className="main-pane-header">
          <h2 className="main-pane-title">{title}</h2>
        </header>
        {groups.length === 0 && overdue.length === 0 && completed.length === 0 ? (
          <p className="today-empty">Nothing in this view.</p>
        ) : (
          <>
        {overdue.length > 0 && (
          <section className="today-group today-overdue" aria-label="Overdue">
            <button
              type="button"
              className="today-section-toggle today-overdue-toggle"
              aria-expanded={!overdueCollapsed}
              onClick={() => toggle('overdue')}
            >
              <svg className="svg-icon" aria-hidden="true">
                <use
                  href={`/icons.svg#${overdueCollapsed ? 'chevron-right-icon' : 'chevron-down-icon'}`}
                />
              </svg>
              <h3 className="today-group-title">Overdue</h3>
              <span className="sidebar-link-count">{overdue.length}</span>
            </button>
            {!overdueCollapsed && overdueTaskIds.length > 0 && (
              <ReadOnlyTaskList ids={overdueTaskIds} showDueDate />
            )}
          </section>
        )}
        {groups.map((area) => (
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
              {area.roots.map((root) => {
                const rootTaskId = root.rootTaskId;
                return (
                <div key={rootTaskId} className="today-project">
                  {!root.rootDue && (
                    <h4 className="today-project-title">
                      <RootTaskTitle rootTaskId={rootTaskId} />
                    </h4>
                  )}
                  {root.rootDue && (
                    <RootTaskDueRow
                      rootTaskId={rootTaskId}
                      badgeLabel={dueBadgeLabel}
                      collapsed={collapsed.has(rootTaskId)}
                      onToggleCollapse={
                        expandDueRoots ? () => toggle(rootTaskId) : undefined
                      }
                    />
                  )}
                  {root.rootDue && expandDueRoots && !collapsed.has(rootTaskId) ? (
                    // Today: the full subtree (same tree as the task detail
                    // pane) supersedes the read-only due-task rows.
                    <div className="project-row-tasks">
                      <DueRootSubtree rootTaskId={rootTaskId} onMove={onMove} />
                    </div>
                  ) : (
                    root.taskIds.length > 0 && (
                      <ReadOnlyTaskList ids={root.taskIds} showDueDate={showRowDates} />
                    )
                  )}
                </div>
                );
              })}
            </section>
          ))}
          </>
        )}
        {completed.length > 0 && (
          <section className="today-group today-done" aria-label="Done">
            <button
              type="button"
              className="today-section-toggle"
              aria-expanded={!doneCollapsed}
              onClick={() => toggle('done')}
            >
              <svg className="svg-icon" aria-hidden="true">
                <use
                  href={`/icons.svg#${doneCollapsed ? 'chevron-right-icon' : 'chevron-down-icon'}`}
                />
              </svg>
              <h3 className="today-group-title">Done</h3>
              <span className="sidebar-link-count">{completed.length}</span>
            </button>
            {!doneCollapsed &&
              (showRowDates ? (
                [...doneByDay].map(([day, dayItems]) => {
                  const dayCollapsed = collapsedDays.has(day);
                  const dayLabel = weekdayWithDate(day);
                  return (
                    <section key={day} className="today-done-day" aria-label={dayLabel}>
                      <button
                        type="button"
                        className="today-done-day-toggle"
                        aria-expanded={!dayCollapsed}
                        onClick={() => toggleDay(day)}
                      >
                        <svg className="svg-icon" aria-hidden="true">
                          <use
                            href={`/icons.svg#${dayCollapsed ? 'chevron-right-icon' : 'chevron-down-icon'}`}
                          />
                        </svg>
                        <h4 className="today-group-title">{dayLabel}</h4>
                        <span className="sidebar-link-count">{dayItems.length}</span>
                      </button>
                      {!dayCollapsed && (
                        <ReadOnlyTaskList
                          ids={dayItems.map((item) => item.taskId)}
                          showDueDate={showRowDates}
                        />
                      )}
                    </section>
                  );
                })
              ) : (
                <section
                  className="today-done-day today-done-day--single"
                  aria-label="Done today"
                >
                  <ReadOnlyTaskList
                    ids={completed.map((item) => item.taskId)}
                    showDueDate={showRowDates}
                  />
                </section>
              ))}
          </section>
        )}
      </div>
    </main>
  );
}