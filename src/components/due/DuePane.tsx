import { useMemo } from 'react';
import {
  useDataLayer,
  useAreaCounts,
  useDueItems,
  useCompletedItemsInRange,
  useTask,
  useSubtreeProgress,
  setTaskStatus,
  TASK_STATUS,
  areaColorHex,
  moveTask,
  childTaskIds,
  getPlacement,
  sortTaskIds,
  useTableVersion,
  PLACEMENT_SEP,
  COLUMNS,
  TABLES,
} from '../../data/index.ts';
import type { MergeableStore } from 'tinybase';
import type { CompletedItem, DueItem } from '../../data/index.ts';
import { useSelection } from '../context/useSelection.ts';
import { useUndo } from '../context/useUndo.ts';
import { useCollapsedSet } from '../hooks/useCollapsedSet.ts';
import { todayIso, weekdayWithDate } from '../shared/dates.ts';
import ReadOnlyTaskList from '../tasks/ReadOnlyTaskList.tsx';
import TaskTree from '../tasks/TaskTree.tsx';
import TaskProgressMeter from '../tasks/TaskProgressMeter.tsx';
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
  return <TaskTree rootIds={childIds} onMove={onMove} draftRootTaskId={rootTaskId} />;
}

/**
 * Due sub-tasks rendered as subtree roots. When both an ancestor and one
 * of its descendants are due in this bucket, keep only the ancestor as a
 * render root: TaskTree supplies the descendant in place, so listing both
 * would duplicate that branch. Dragging stays disabled because these
 * cross-cutting roots can belong to different immediate parents.
 */
function DueTaskTrees({
  taskIds,
  onMove,
  showDueDate,
}: {
  taskIds: readonly string[];
  onMove: (activeId: string, parentId: string | null, beforeId: string | undefined) => void;
  showDueDate: boolean;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const rootIds = useMemo(() => {
    const dueIds = new Set(taskIds);
    return taskIds.filter((taskId) => {
      const seen = new Set<string>([taskId]);
      let placement = getPlacement(store, taskId);
      while (placement.kind === 'task' && !seen.has(placement.id)) {
        if (dueIds.has(placement.id)) return false;
        seen.add(placement.id);
        placement = getPlacement(store, placement.id);
      }
      return true;
    });
  }, [store, taskIds]);

  return (
    <TaskTree
      rootIds={rootIds}
      onMove={onMove}
      droppable={false}
      showDueDate={showDueDate}
    />
  );
}

/** A root task that is due in the current range, routed by its
 * descendant count like `TaskTreeRow`. A parent (≥1 descendant) is a
 * link row into its task pane, styled like the area-view parent row:
 * caret (toggles the subtree rendered below), name, and the derived
 * subtree progress meter — no checkbox affordance, since a parent's
 * done state is derived. A bare root (no descendants) is a leaf: a
 * working checkbox for its own done state, with the same name link
 * and due badge. With `showRowDates` (overdue sections) the trailing
 * element becomes the root's own due date — each overdue row dates
 * itself, so a past-due root shows when it fell due instead of the
 * semantic badge. */
function RootTaskDueRow({
  rootTaskId,
  badgeLabel,
  showRowDates = false,
  collapsed,
  onToggleCollapse,
}: {
  rootTaskId: string;
  badgeLabel: string;
  /** Emit the root's actual due date instead of the `badgeLabel`. */
  showRowDates?: boolean;
  /** Tree-collapsed state. */
  collapsed: boolean;
  /** Toggles the subtree under this row. */
  onToggleCollapse: () => void;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const { offerUndo } = useUndo();
  const task = useTask(store, rootTaskId);
  const { total } = useSubtreeProgress(store, rootTaskId);
  if (!task) return null;

  const openPane = (): void => {
    navigate({ kind: 'task', id: rootTaskId });
  };

  if (total === 0) {
    const done = task.status === TASK_STATUS.done;
    return (
      <div className="today-project-due-row">
        <input
          type="checkbox"
          className="task-line-check"
          checked={done}
          onChange={() => {
            if (done) {
              setTaskStatus(store, rootTaskId, TASK_STATUS.open);
              return;
            }
            setTaskStatus(store, rootTaskId, TASK_STATUS.done);
            offerUndo({
              label: `Completed “${task.title || 'Untitled'}”`,
              onUndo: () => setTaskStatus(store, rootTaskId, TASK_STATUS.open),
            });
          }}
          aria-label={done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
        />
        <button
          type="button"
          className="today-project-due"
          onClick={openPane}
          aria-label={`Task due ${showRowDates && task.dueDate ? weekdayWithDate(task.dueDate) : badgeLabel.toLowerCase()}`}
        >
          <span className="today-project-due-name">{task.title || 'Untitled'}</span>
          {showRowDates && task.dueDate ? (
            <span
              className="task-line-due-date"
              aria-label={`Due ${weekdayWithDate(task.dueDate)}`}
            >
              {weekdayWithDate(task.dueDate)}
            </span>
          ) : (
            <span className="today-due-badge">{badgeLabel}</span>
          )}
        </button>
      </div>
    );
  }

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
      <button
        type="button"
        className="today-project-due"
        onClick={openPane}
        aria-label={`Task due ${showRowDates && task.dueDate ? weekdayWithDate(task.dueDate) : badgeLabel.toLowerCase()}`}
      >
        <span className="today-project-due-name">
          <RootTaskTitle rootTaskId={rootTaskId} />
        </span>
        <TaskProgressMeter taskId={rootTaskId} />
        {showRowDates && task.dueDate ? (
          <span
            className="task-line-due-date"
            aria-label={`Due ${weekdayWithDate(task.dueDate)}`}
          >
            {weekdayWithDate(task.dueDate)}
          </span>
        ) : (
          <span className="today-due-badge">{badgeLabel}</span>
        )}
      </button>
    </div>
  );
}

/**
 * The Area → Root-task sections shared by both views: Today renders them
 * directly under the pane header, Week nests them inside each due-day
 * bucket (`areaLabel` names the owning day instead of the pane). Rows
 * carry no per-row date label by default — the day header (or Today's
 * single day) carries it; overdue sections opt into `showRowDates` so
 * each row dates itself.
 */
function AreaGroups({
  groups,
  areaLabel,
  collapsed,
  toggleRoot,
  dueBadgeLabel,
  onMove,
  showRowDates = false,
}: {
  groups: DueAreaGroup[];
  /** Sentence-style section label, e.g. "Home items due Mon, Jul 20". */
  areaLabel: (area: DueAreaGroup) => string;
  collapsed: ReadonlySet<string>;
  toggleRoot: (rootTaskId: string) => void;
  /** Label rendered on root-due rows (e.g. "Due this week"). */
  dueBadgeLabel: string;
  onMove: (activeId: string, parentId: string | null, beforeId: string | undefined) => void;
  /** Render per-row due-date labels (overdue rows date themselves). */
  showRowDates?: boolean;
}): React.JSX.Element {
  return (
    <>
      {groups.map((area) => (
        <section
          key={area.areaId ?? 'inbox'}
          className="today-group"
          aria-label={areaLabel(area)}
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
                    showRowDates={showRowDates}
                    collapsed={collapsed.has(rootTaskId)}
                    onToggleCollapse={() => toggleRoot(rootTaskId)}
                  />
                )}
                {root.rootDue && !collapsed.has(rootTaskId) ? (
                  // The full subtree (same tree as the task detail pane)
                  // supersedes the read-only due-task rows.
                  <div className="project-row-tasks">
                    <DueRootSubtree rootTaskId={rootTaskId} onMove={onMove} />
                  </div>
                ) : (
                  root.taskIds.length > 0 && (
                    <DueTaskTrees
                      taskIds={root.taskIds}
                      onMove={onMove}
                      showDueDate={showRowDates}
                    />
                  )
                )}
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}

/**
 * Shared body for the Today and Week views. The range filtering, header,
 * and badge label differ (`from === to` is the single-day Today view);
 * the row behavior is identical. A root task whose own due date falls in
 * range renders as a link row with a collapse caret and expands its full
 * subtree in place. When only nested tasks are due, those tasks become
 * roots of the same collapsible `TaskTree`, with their complete descendant
 * branches shown inline instead of a flat due-only list.
 *
 * The Overdue section (due before today) reuses the same Area → Root
 * grouping with per-row date labels; a divider separates it from the
 * in-range items. Today groups in-range items under area headings; Week
 * buckets them by due day into collapsible sections and re-groups each day
 * into the same area headings.
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
  /** LocalStorage key for collapse state (Overdue/Done sections, due-day buckets, due-root trees). */
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
  // Week due-day buckets — distinct from the Done section's `:days` set.
  const { collapsed: collapsedDueDays, toggle: toggleDueDay } = useCollapsedSet(
    `${storageKey}:due-days`,
  );

  const today = todayIso();
  const open = useMemo(() => items.filter((i) => !i.done), [items]);
  /** Open items whose due date has already passed — lifted out of the
   * range groups into the Overdue section. Same definition in both
   * views: anything due before today. */
  const overdue = useMemo(() => open.filter((i) => i.dueDate < today), [open, today]);
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

  const areaMeta = useMemo(
    () => new Map(counts.map((c) => [c.id, { name: c.name, color: c.color, order: c.order }])),
    [counts],
  );

  const groups = useMemo(
    () => groupDueItems(store, inRange, areaMeta),
    [store, inRange, areaMeta],
  );

  // Overdue reuses the same Area → Root grouping; rows keep per-row
  // date labels since each overdue item can carry a different past date.
  const overdueGroups = useMemo(
    () => groupDueItems(store, overdue, areaMeta),
    [store, overdue, areaMeta],
  );
  // Week view only: open in-range items bucketed by due day (local ISO,
  // ascending). Each day re-groups its items with `groupDueItems` so the
  // day sections reuse the Today view's Area → Root structure.
  const dayGroups = useMemo(() => {
    if (from === to) return [];
    const buckets = new Map<string, DueItem[]>();
    for (const item of inRange) {
      const bucket = buckets.get(item.dueDate);
      if (bucket) bucket.push(item);
      else buckets.set(item.dueDate, [item]);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([day, dayItems]) => ({
        day,
        count: dayItems.length,
        areas: groupDueItems(store, dayItems, areaMeta),
      }));
  }, [from, to, inRange, store, areaMeta]);

  const overdueCollapsed = collapsed.has('overdue');
  const doneCollapsed = collapsed.has('done');
  const showRowDates = from !== to;

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
    <main className={`main due-pane${from === to ? ' today-pane' : ''}`} aria-label={title}>
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
            {!overdueCollapsed && (
              <AreaGroups
                groups={overdueGroups}
                areaLabel={(area) => `${area.name} items overdue`}
                collapsed={collapsed}
                toggleRoot={toggle}
                dueBadgeLabel="Overdue"
                onMove={onMove}
                showRowDates
              />
            )}
          </section>
        )}
        {overdue.length > 0 && inRange.length > 0 && (
          <hr className="today-overdue-divider" />
        )}
        {from === to && (
          <AreaGroups
            groups={groups}
            areaLabel={(area) => `${area.name} items in ${title.toLowerCase()}`}
            collapsed={collapsed}
            toggleRoot={toggle}
            dueBadgeLabel={dueBadgeLabel}
            onMove={onMove}
          />
        )}
        {from !== to &&
          dayGroups.map(({ day, count, areas }) => {
            const dayCollapsed = collapsedDueDays.has(day);
            const dayLabel = weekdayWithDate(day);
            return (
              <section key={day} className="today-due-day" aria-label={dayLabel}>
                <button
                  type="button"
                  className="today-due-day-toggle"
                  aria-expanded={!dayCollapsed}
                  onClick={() => toggleDueDay(day)}
                >
                  <svg className="svg-icon" aria-hidden="true">
                    <use
                      href={`/icons.svg#${dayCollapsed ? 'chevron-right-icon' : 'chevron-down-icon'}`}
                    />
                  </svg>
                  <h4 className="today-group-title">{dayLabel}</h4>
                  <span className="sidebar-link-count">{count}</span>
                </button>
                {!dayCollapsed && (
                  <AreaGroups
                    groups={areas}
                    areaLabel={(area) => `${area.name} items due ${dayLabel}`}
                    collapsed={collapsed}
                    toggleRoot={toggle}
                    dueBadgeLabel={dueBadgeLabel}
                    onMove={onMove}
                  />
                )}
              </section>
            );
          })}
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