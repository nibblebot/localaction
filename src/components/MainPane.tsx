import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useRowIds } from 'tinybase/ui-react';
import {
  useDataLayer,
  useTableVersion,
  useArea,
  useAreaCounts,
  useNote,
  useProject,
  useProjectRollups,
  useTasksForProjectDeep,
  useNotesForAreaTree,
  createProject,
  createTask,
  createNote,
  createSection,
  updateProject,
  createArea,
  getArea,
  deleteProject,
  deleteArea,
  deleteNote,
  captureSubtree,
  restoreSubtree,
  moveTask,
  PLACEMENT_SEP,
  getEffectiveTaskStatus,
  TABLES,
  TASK_STATUS,
  PROJECT_STATUS,
  NOTE_ENTITY_TYPE,
  COLUMNS,
  getPlacement,
  useInboxTaskIds,
  getAreaTaskIds,
  useAreaTaskIds,
} from '../data/index.ts';
import type { Area, AreaCount } from '../data/index.ts';
import type { MergeableStore } from 'tinybase';
import { useSelection } from './useSelection.ts';
import { useUndo } from './useUndo.ts';
import { INBOX } from '../router.ts';
import TodayPane from './TodayPane.tsx';
import WeekPane from './WeekPane.tsx';
import ConfirmModal from './ConfirmModal.tsx';
import AreaEditPopover from './AreaEditPopover.tsx';
import InlineAddInput from './InlineAddInput.tsx';
import InlineAddButton from './InlineAddButton.tsx';
import { areaColorHex } from '../data/colors.ts';
import type { AreaColorId } from '../data/colors.ts';
import type { SortableHandleProps } from './SortableList.tsx';
import { TaskTreeByStatus } from './TaskList.tsx';
import ProjectTaskList from './ProjectTaskList.tsx';
import ProjectStatusGroups from './ProjectStatusGroups.tsx';
import type { ProjectStatusSlice } from './ProjectStatusGroups.tsx';
import Group from './Group.tsx';
import ProjectDueDateButton from './ProjectDueDateButton.tsx';
import { queueTaskTitleFocus, queueSectionTitleFocus } from './taskTitleFocus.ts';
import { useShowCompleted } from './useShowCompleted.ts';
import { useCollapsedProjects } from './useCollapsedProjects.ts';
import { useCollapsedSections } from './useCollapsedSections.ts';
import { useCollapsedProjectGroups } from './useCollapsedProjectGroups.ts';
import { useHiddenEmptySections } from './useHiddenEmptySections.ts';
import type { CollapsedSet } from './useCollapsedSet.ts';

// Lazy: carries markdown-it (~100KB min) out of the main chunk —
// loaded on first note-preview render, never on task-only surfaces.
const NoteMarkdown = lazy(() => import('./NoteMarkdown.tsx'));

export default function MainPane(): React.JSX.Element {
  const { store } = useDataLayer();
  const { selection, navigate } = useSelection();
  const counts = useAreaCounts(store);

  const areaId = selection.kind === 'area' ? selection.id : null;
  const area = useArea(store, areaId ?? undefined);

  const { showCompleted, toggle: toggleCompleted } = useShowCompleted();
  const collapsedProjects = useCollapsedProjects();
  const collapsedSections = useCollapsedSections();
  const collapsedProjectGroups = useCollapsedProjectGroups();
  const hiddenEmptySections = useHiddenEmptySections();

  const parentChain = useMemo<readonly HeaderArea[]>(() => {
    if (!areaId) return [];
    return buildParentChainFromCounts(counts, areaId);
  }, [counts, areaId]);

  // Depth-first list of every descendant area (sub-areas, recursively),
  // so the tabs below can roll their content into this view.
  const subAreas = useMemo<readonly SubAreaRef[]>(() => {
    if (!areaId) return [];
    const byParent = new Map<string, typeof counts>();
    for (const c of counts) {
      if (!c.parentId) continue;
      const list = byParent.get(c.parentId) ?? [];
      list.push(c);
      byParent.set(c.parentId, list);
    }
    const out: SubAreaRef[] = [];
    const walk = (id: string): void => {
      const kids = [...(byParent.get(id) ?? [])].sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.localeCompare(b.name);
      });
      for (const k of kids) {
        out.push({ id: k.id, name: k.name, color: k.color });
        walk(k.id);
      }
    };
    walk(areaId);
    return out;
  }, [counts, areaId]);

  if (selection.kind === 'project') {
    return <ProjectPane projectId={selection.id} hiddenEmptySections={hiddenEmptySections} />;
  }

  if (selection.kind === 'project-notes') {
    return <ProjectNotesPane projectId={selection.id} />;
  }

  if (selection.kind === 'inbox') {
    return <InboxPane />;
  }

  if (selection.kind === 'today') {
    return <TodayPane />;
  }

  if (selection.kind === 'week') {
    return <WeekPane />;
  }

  if (!areaId || !area) {
    return (
      <main className="main" aria-label="Editor">
        <div className="main-body">
          <div className="main-empty">
            <h2>Welcome to LocalAction</h2>
            <p>
              {counts.length === 0
                ? 'Create an area in the sidebar to get started.'
                : 'Pick an area from the sidebar to get started.'}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const projectCount = counts.find((c) => c.id === areaId)?.projectCount ?? 0;
  const noteCount = counts.find((c) => c.id === areaId)?.noteCount ?? 0;


  const goToArea = (id: string): void => {
    navigate({ kind: 'area', id });
  };

  const addSubArea = (subName: string): void => {
    const id = createArea(store, {
      name: subName,
      parentId: areaId,
      color: area.color,
    });
    navigate({ kind: 'area', id });
  };
  const goToInbox = (): void => {
    navigate(INBOX);
  };

  return (
    <main className="main" aria-label="Editor">
      <div className="main-body">
        <AreaHeader
          areaId={areaId}
          name={area.name}
          color={area.color}
          parentChain={parentChain}
          showCompleted={showCompleted}
          onToggleCompleted={toggleCompleted}
          onNavigate={goToArea}
          onCreateSubArea={addSubArea}
          onDeleteArea={goToInbox}
        />
        <CollapsibleSection
          title="Projects"
          icon="project-list"
          count={projectCount}
          collapsed={collapsedSections.collapsed.has('projects')}
          onToggleCollapse={() => collapsedSections.toggle('projects')}
          trailing={
            <ProjectCollapseAllButton
              areaId={areaId}
              subAreas={subAreas}
              collapsed={collapsedProjects.collapsed}
              replace={collapsedProjects.replace}
            />
          }
        >
          <ProjectsSection
            areaId={areaId}
            subAreas={subAreas}
            showCompleted={showCompleted}
            collapsed={collapsedProjects.collapsed}
            onToggleCollapse={collapsedProjects.toggle}
            collapsedGroups={collapsedProjectGroups.collapsed}
            onToggleGroup={collapsedProjectGroups.toggle}
            hiddenEmptySections={hiddenEmptySections.collapsed}
            onToggleEmptySections={hiddenEmptySections.toggle}
          />
        </CollapsibleSection>
        <AreaTasksSection
          areaId={areaId}
          subAreas={subAreas}
          showCompleted={showCompleted}
          collapsed={collapsedSections.collapsed.has('tasks')}
          onToggleCollapse={() => collapsedSections.toggle('tasks')}
        />
        <CollapsibleSection
          title="Notes"
          icon="notes"
          count={noteCount}
          collapsed={collapsedSections.collapsed.has('notes')}
          onToggleCollapse={() => collapsedSections.toggle('notes')}
          trailing={
            <AddNoteButton
              areaId={areaId}
              onOpen={() => {
                if (collapsedSections.collapsed.has('notes')) collapsedSections.toggle('notes');
              }}
            />
          }
        >
          <NotesSection areaId={areaId} />
        </CollapsibleSection>
      </div>
    </main>
  );
}

function AreaHeader({
  areaId,
  name,
  color,
  parentChain,
  showCompleted,
  onToggleCompleted,
  onNavigate,
  onCreateSubArea,
  onDeleteArea,
}: {
  areaId: string;
  parentChain: readonly HeaderArea[];
  name: string;
  color: AreaColorId;
  showCompleted: boolean;
  onToggleCompleted: () => void;
  onNavigate: (id: string) => void;
  onCreateSubArea: (name: string) => void;
  onDeleteArea: () => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const hex = areaColorHex(color);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editAnchor, setEditAnchor] = useState<{ x: number; y: number } | null>(null);
  const { offerUndo } = useUndo();

  function openEditor(e: MouseEvent<HTMLElement>): void {
    const rect = e.currentTarget.getBoundingClientRect();
    setEditAnchor({ x: rect.left, y: rect.bottom + 6 });
  }

  function commit(): void {
    const trimmed = draft.trim();
    if (!trimmed) {
      setAdding(false);
      setDraft('');
      return;
    }
    onCreateSubArea(trimmed);
    setAdding(false);
    setDraft('');
  }

  function cancel(): void {
    setAdding(false);
    setDraft('');
  }

  return (
    <div className="area-header">
      {parentChain.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && (
            <span className="area-header-crumb-sep" aria-hidden="true">
              /
            </span>
          )}
          <button
            type="button"
            className="area-header-crumb"
            onClick={() => onNavigate(p.id)}
          >
            <span
              className="area-header-name-edit-dot"
              style={{ background: areaColorHex(p.color) }}
              aria-hidden="true"
            />
            <span>{p.name || 'Untitled'}</span>
          </button>
        </Fragment>
      ))}
      {parentChain.length > 0 && (
        <span className="area-header-slash" aria-hidden="true">
          /
        </span>
      )}
      <h1 className="area-header-name">
        <button
          type="button"
          className="area-header-name-edit"
          onClick={openEditor}
          title="Edit area"
          aria-haspopup="dialog"
          aria-expanded={editAnchor !== null}
        >
          <span
            className="area-header-name-edit-dot"
            style={{ background: hex }}
            aria-hidden="true"
          />
          <span className="area-header-name-edit-text">{name || 'Untitled'}</span>
        </button>
      </h1>
      {adding ? (
        <input
          type="text"
          className="area-header-add-input"
          placeholder="Sub-area name…"
          aria-label="Sub-area name"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="area-header-add"
          onClick={() => setAdding(true)}
          aria-label="Add sub-area"
          title="Add sub-area"
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#add-icon" />
          </svg>
        </button>
      )}
      <div className="area-header-actions">
        <CompletedToggle showCompleted={showCompleted} onToggle={onToggleCompleted} />
      </div>

      <AreaEditPopover
        anchor={editAnchor}
        areaId={areaId}
        name={name}
        color={color}
        onClose={() => setEditAnchor(null)}
        onRequestDelete={() => {
          setEditAnchor(null);
          setConfirmDelete(true);
        }}
      />
      <ConfirmModal
        open={confirmDelete}
        title="Delete area?"
        message={`"${name || 'Untitled'}" will be deleted along with every sub-area, project, task, and note inside it.`}
        confirmLabel="Delete"
        onConfirm={() => {
          const snapshot = captureSubtree(store, NOTE_ENTITY_TYPE.area, areaId);
          deleteArea(store, areaId);
          setConfirmDelete(false);
          onDeleteArea();
          offerUndo({
            label: `Deleted area “${name || 'Untitled'}”`,
            onUndo: () => {
              restoreSubtree(store, snapshot);
              onNavigate(areaId);
            },
          });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

type HeaderArea = Pick<Area, 'id' | 'name' | 'color'>;

function buildParentChainFromCounts(
  counts: readonly AreaCount[],
  areaId: string,
): HeaderArea[] {
  const byId = new Map(counts.map((area) => [area.id, area]));
  const chain: HeaderArea[] = [];
  const seen = new Set<string>([areaId]);
  let current = byId.get(areaId);
  while (current?.parentId && !seen.has(current.parentId)) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    chain.push({ id: parent.id, name: parent.name, color: parent.color });
    seen.add(parent.id);
    current = parent;
  }
  return chain.reverse();
}

function buildParentChain(store: MergeableStore, areaId: string): Area[] {
  const chain: Area[] = [];
  const seen = new Set<string>([areaId]);
  let current = getArea(store, areaId);
  while (current?.parentId && !seen.has(current.parentId)) {
    const parent = getArea(store, current.parentId);
    if (!parent) break;
    chain.push(parent);
    seen.add(parent.id);
    current = parent;
  }
  return chain.reverse();
}

/**
 * Completed-task visibility toggle, shared by the area toolbar and the
 * inbox header. Renders active (accent tint) while done tasks show in
 * place.
 */
function CompletedToggle({
  showCompleted,
  onToggle,
}: {
  showCompleted: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`area-tab-action${showCompleted ? ' area-tab-action-active' : ''}`}
      aria-label={showCompleted ? 'Hide completed tasks' : 'Show completed tasks'}
      title={showCompleted ? 'Hide completed tasks' : 'Show completed tasks'}
      aria-pressed={showCompleted}
      onClick={onToggle}
    >
      <svg className="svg-icon" aria-hidden="true">
        <use href="/icons.svg#check-icon" />
      </svg>
    </button>
  );
}

/**
 * Top-level area-view section (Area tasks / Projects / Notes) with a
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
  trailing?: React.ReactNode;
  children: React.ReactNode;
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
          <span className="tab-group-count">· {count}</span>
        </button>
        {trailing}
      </div>
      {!collapsed && children}
    </section>
  );
}

interface SubAreaRef {
  id: string;
  name: string;
  color: AreaColorId;
}

/**
 * Collapse-all / expand-all for the combined Projects tab. Operates on
 * every project rolled into the view (the area plus its sub-areas).
 */
function ProjectCollapseAllButton({
  areaId,
  subAreas,
  collapsed,
  replace,
}: {
  areaId: string;
  subAreas: readonly SubAreaRef[];
  collapsed: ReadonlySet<string>;
  replace: (ids: Iterable<string>) => void;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const rollups = useProjectRollups(store);
  const ids = useMemo(() => {
    const areaIds = new Set([areaId, ...subAreas.map((sa) => sa.id)]);
    return rollups.filter((r) => r.areaId !== null && areaIds.has(r.areaId)).map((r) => r.projectId);
  }, [rollups, areaId, subAreas]);
  if (ids.length === 0) return null;
  const allCollapsed = ids.every((id) => collapsed.has(id));
  return (
    <button
      type="button"
      className="area-tab-action"
      aria-label={allCollapsed ? 'Expand all projects' : 'Collapse all projects'}
      title={allCollapsed ? 'Expand all projects' : 'Collapse all projects'}
      onClick={() => replace(allCollapsed ? [] : ids)}
    >
      <svg className="svg-icon" aria-hidden="true">
        <use href={`/icons.svg#${allCollapsed ? 'expand-all-icon' : 'collapse-all-icon'}`} />
      </svg>
    </button>
  );
}

function ProjectsSection({
  areaId,
  subAreas,
  showCompleted,
  collapsed,
  onToggleCollapse,
  collapsedGroups,
  onToggleGroup,
  hiddenEmptySections,
  onToggleEmptySections,
}: {
  areaId: string;
  subAreas: readonly SubAreaRef[];
  showCompleted: boolean;
  collapsed: ReadonlySet<string>;
  onToggleCollapse: (id: string) => void;
  collapsedGroups: ReadonlySet<string>;
  onToggleGroup: (id: string) => void;
  /** Project ids whose empty section headers are pruned. */
  hiddenEmptySections: ReadonlySet<string>;
  onToggleEmptySections: (id: string) => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const rollups = useProjectRollups(store);

  // One slice per in-scope area — the viewed area first (headerless),
  // then every sub-area depth-first — each partitioning its visible
  // projects into the hoisted Active / Backlog / Done groups. Backlog
  // is a stored status and wins over the derived done state: a shelved
  // project stays shelved even when its tasks complete.
  const slices = useMemo<readonly ProjectStatusSlice[]>(() => {
    const partition = (id: string, name: string | null): ProjectStatusSlice => {
      const sorted = rollups
        .filter((r) => r.areaId === id)
        .sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          return a.projectName.localeCompare(b.projectName);
        });
      return {
        areaId: id,
        name,
        backlog: sorted.filter((p) => p.status === PROJECT_STATUS.backlog),
        done: sorted.filter(
          (p) => p.status !== PROJECT_STATUS.backlog && p.total > 0 && p.done === p.total,
        ),
        active: sorted.filter(
          (p) => p.status !== PROJECT_STATUS.backlog && (p.total === 0 || p.done < p.total),
        ),
      };
    };
    return [
      partition(areaId, null),
      ...subAreas.map((sa) => partition(sa.id, sa.name)),
    ];
  }, [rollups, areaId, subAreas]);

  // Sub-area chrome (a clickable header) is attached to the slices here
  // so ProjectStatusGroups stays presentational. The viewed area's own
  // slice gets a static "Area projects" header once sub-areas roll in —
  // with no sub-areas there is nothing to disambiguate, so it stays
  // headerless.
  const viewedArea = useArea(store, areaId);
  const slicesWithChrome = useMemo<readonly ProjectStatusSlice[]>(
    () =>
      slices.map((s) =>
        s.name === null
          ? subAreas.length === 0 || !viewedArea
            ? s
            : { ...s, header: <AreaProjectsHeader color={viewedArea.color} /> }
          : {
            ...s,
            header: (
              <SubAreaHeader
                areaId={s.areaId}
                name={s.name}
                color={subAreas.find((sa) => sa.id === s.areaId)?.color ?? 'gray'}
              />
            ),
          },
      ),
    [slices, subAreas, viewedArea],
  );

  function addProject(name: string, group: 'active' | 'backlog'): void {
    const id = createProject(store, { name, areaId });
    if (group === 'backlog') updateProject(store, id, { status: PROJECT_STATUS.backlog });
  }

  return (
    <section className="projects-tab" aria-label="Projects">
      <ProjectStatusGroups
        slices={slicesWithChrome}
        collapsedGroups={collapsedGroups}
        onToggleGroup={onToggleGroup}
        renderGroupAction={(group) => (
          <InlineAddButton
            label={group === 'active' ? 'Add project to Active' : 'Add project to Backlog'}
            placeholder="New project…"
            inputAriaLabel="New project"
            className="area-tab-action-add"
            onSubmit={(name) => addProject(name, group)}
            onOpenChange={(open) => {
              if (open && collapsedGroups.has(group)) onToggleGroup(group);
            }}
          />
        )}
        renderSortableRow={(p, handle) => (
          <SortableProjectRow
            handle={handle}
            projectId={p.projectId}
            name={p.projectName}
            done={p.done}
            total={p.total}
            showCompleted={showCompleted}
            collapsed={collapsed.has(p.projectId)}
            onToggleCollapse={() => onToggleCollapse(p.projectId)}
            hideEmptySections={hiddenEmptySections.has(p.projectId)}
            onToggleEmptySections={() => onToggleEmptySections(p.projectId)}
          />
        )}
        renderRow={(p) => (
          <ProjectRow
            key={p.projectId}
            projectId={p.projectId}
            name={p.projectName}
            done={p.done}
            total={p.total}
            doneGroup
            showCompleted={showCompleted}
            collapsed={collapsed.has(p.projectId)}
            onToggleCollapse={() => onToggleCollapse(p.projectId)}
            hideEmptySections={hiddenEmptySections.has(p.projectId)}
            onToggleEmptySections={() => onToggleEmptySections(p.projectId)}
          />
        )}
      />
    </section>
  );
}

/** Static heading for the viewed area's own project slice: the
 *  projects that live directly in the area rather than in one of its
 *  sub-areas. A label, not a navigation target — clicking through
 *  would be a no-op on the already-viewed area. */
function AreaProjectsHeader({
  color,
}: {
  color: AreaColorId;
}): React.JSX.Element {
  return (
    <header className="subarea-header">
      <span className="subarea-header-name subarea-header-static">
        <span
          className="sidebar-item-dot"
          style={{ background: areaColorHex(color) }}
          aria-hidden="true"
        />
        Area projects
      </span>
    </header>
  );
}

/** Clickable heading for a rolled-in sub-area section. */
function SubAreaHeader({
  areaId,
  name,
  color,
}: {
  areaId: string;
  name: string;
  color: AreaColorId;
}): React.JSX.Element {
  const { navigate } = useSelection();
  return (
    <header className="subarea-header">
      <button
        type="button"
        className="subarea-header-name"
        title="Open sub-area"
        onClick={() => navigate({ kind: 'area', id: areaId })}
      >
        <span
          className="sidebar-item-dot"
          style={{ background: areaColorHex(color) }}
          aria-hidden="true"
        />
        {name || 'Untitled'}
      </button>
    </header>
  );
}

/** Done/total progress meter shared by the project card header and the
 *  project detail pane header. `doneGroup` tints the bar green (the
 *  card sits in the Done status group). */
function ProjectProgressMeter({
  done,
  total,
  doneGroup,
}: {
  done: number;
  total: number;
  doneGroup?: boolean;
}): React.JSX.Element {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="project-row-progress" aria-label={`${done} of ${total} tasks done`}>
      <div
        className={`project-row-progress-bar${doneGroup ? ' project-row-progress-done' : ''}`}
      >
        <div className="project-row-progress-fill" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <span className="project-row-progress-count">
        {done} / {total}
      </span>
    </div>
  );
}

/**
 * The add-task "+", pinned right next to the project name — the same
 * slot the section and group headers give their add affordance —
 * instead of buried in the right-edge action cluster. Shares the
 * card's hover-reveal chrome (`.project-row-action`).
 */
function ProjectAddTaskButton({
  projectId,
  display,
  onEnsureExpanded,
}: {
  projectId: string;
  /** Display name for the aria-label. */
  display: string;
  /** Expands a collapsed card so the new row can mount (panes omit). */
  onEnsureExpanded?: () => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  return (
    <button
      type="button"
      className="project-row-action project-row-add"
      aria-label={`Add task to ${display}`}
      title="Add task"
      onClick={(e) => {
        e.stopPropagation();
        onEnsureExpanded?.();
        const id = createTask(store, { title: '', placement: { kind: 'project', id: projectId } });
        queueTaskTitleFocus(id);
      }}
    >
      <svg className="svg-icon" aria-hidden="true">
        <use href="/icons.svg#plus-filled-icon" />
      </svg>
    </button>
  );
}

/**
 * The project action cluster shared by the area-view card and the
 * project detail pane: add-section, due date, empty-section pruning,
 * notes, rename, delete. Delete is confirmed and undoable;
 * `onAfterDelete` lets the detail pane navigate away from the removed
 * project. The add affordances create an empty task/section and hand
 * focus to its title input once the row mounts.
 */
function ProjectRowActions({
  projectId,
  display,
  hideEmptySections,
  onToggleEmptySections,
  onRename,
  onAfterDelete,
  onEnsureExpanded,
}: {
  projectId: string;
  /** Display name for aria-labels and the delete confirmation. */
  display: string;
  /** Prune section headers with no visible tasks in the task list. */
  hideEmptySections: boolean;
  onToggleEmptySections: () => void;
  onRename: () => void;
  /** Runs after a confirmed delete (panes navigate away; rows omit). */
  onAfterDelete?: () => void;
  /** Expands a collapsed card so the new row can mount (panes omit). */
  onEnsureExpanded?: () => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const { offerUndo } = useUndo();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <>
      <button
        type="button"
        className="project-row-action"
        aria-label={`Add section to ${display}`}
        title="Add section"
        onClick={(e) => {
          e.stopPropagation();
          onEnsureExpanded?.();
          // A freshly created (empty) section would be pruned while
          // empty-section pruning is on, stranding the queued focus.
          if (hideEmptySections) onToggleEmptySections();
          const id = createSection(store, { name: '', projectId });
          queueSectionTitleFocus(id);
        }}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#add-section-icon" />
        </svg>
      </button>
      <ProjectDueDateButton projectId={projectId} />
      <button
        type="button"
        className={`project-row-action${hideEmptySections ? ' project-row-action-active' : ''}`}
        aria-label={`${hideEmptySections ? 'Show' : 'Hide'} empty sections in ${display}`}
        aria-pressed={hideEmptySections}
        title={hideEmptySections ? 'Show empty sections' : 'Hide empty sections'}
        onClick={(e) => {
          e.stopPropagation();
          onToggleEmptySections();
        }}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#sections-icon" />
        </svg>
      </button>
      <button
        type="button"
        className="project-row-action"
        aria-label={`Open notes for ${display}`}
        title="Notes"
        onClick={(e) => {
          e.stopPropagation();
          navigate({ kind: 'project-notes', id: projectId });
        }}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#notes-icon" />
        </svg>
      </button>
      <button
        type="button"
        className="project-row-action"
        aria-label="Rename project"
        title="Rename"
        onClick={(e) => {
          e.stopPropagation();
          onRename();
        }}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#edit-icon" />
        </svg>
      </button>
      <button
        type="button"
        className="project-row-action project-row-action-danger"
        aria-label="Delete project"
        title="Delete"
        onClick={(e) => {
          e.stopPropagation();
          setConfirmDelete(true);
        }}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#trash-icon" />
        </svg>
      </button>
      <ConfirmModal
        open={confirmDelete}
        title="Delete project?"
        message={`"${display}" will be deleted along with its tasks and notes.`}
        confirmLabel="Delete"
        onConfirm={() => {
          const snapshot = captureSubtree(store, NOTE_ENTITY_TYPE.project, projectId);
          deleteProject(store, projectId);
          setConfirmDelete(false);
          offerUndo({
            label: `Deleted project “${display}”`,
            onUndo: () => {
              restoreSubtree(store, snapshot);
            },
          });
          onAfterDelete?.();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

function ProjectRow({
  projectId,
  name,
  done,
  total,
  doneGroup,
  showCompleted,
  collapsed,
  onToggleCollapse,
  hideEmptySections,
  onToggleEmptySections,
}: {
  projectId: string;
  name: string;
  done: number;
  total: number;
  doneGroup?: boolean;
  showCompleted: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Prune section headers with no visible tasks in the expanded card. */
  hideEmptySections: boolean;
  onToggleEmptySections: () => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const project = useProject(store, projectId);
  const [editing, setEditing] = useState(false);

  const display = (project?.name ?? '') || name || 'Untitled';

  const openProject = (): void => {
    navigate({ kind: 'project', id: projectId });
  };

  return (
    <li className={`project-row${doneGroup ? ' project-row-done' : ''}`}>
      <div className="project-row-line" onClick={openProject}>
        <button
          type="button"
          className="project-row-caret"
          aria-label={collapsed ? `Expand ${display}` : `Collapse ${display}`}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand tasks' : 'Collapse tasks'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href={`/icons.svg#${collapsed ? 'chevron-right-icon' : 'chevron-down-icon'}`} />
          </svg>
        </button>
        {editing ? (
          <input
            type="text"
            className="project-row-name-input"
            aria-label="Project name"
            defaultValue={display}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const next = e.currentTarget.value.trim() || 'Untitled';
              if (next !== display) {
                store.setCell(TABLES.projects, projectId, COLUMNS.projects.name, next);
              }
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              else if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="project-row-name"
            title="Open project"
            onClick={(e) => {
              e.stopPropagation();
              openProject();
            }}
          >
            {display}
          </button>
        )}
        {!editing && (
          <ProjectAddTaskButton
            projectId={projectId}
            display={display}
            onEnsureExpanded={() => {
              if (collapsed) onToggleCollapse();
            }}
          />
        )}
        <div className="project-row-actions">
          <ProjectRowActions
            projectId={projectId}
            display={display}
            hideEmptySections={hideEmptySections}
            onToggleEmptySections={onToggleEmptySections}
            onRename={() => setEditing(true)}
            onEnsureExpanded={() => {
              if (collapsed) onToggleCollapse();
            }}
          />
        </div >
        <ProjectProgressMeter done={done} total={total} doneGroup={doneGroup} />
      </div >
      {!collapsed && (
        <div className="project-row-tasks">
          <ProjectTaskList
            projectId={projectId}
            projectName={display}
            showCompleted={showCompleted}
            hideEmptySections={hideEmptySections}
          />
        </div>
      )
      }
    </li >
  );
}

function SortableProjectRow({
  handle,
  projectId,
  name,
  done,
  total,
  showCompleted,
  collapsed,
  onToggleCollapse,
  hideEmptySections,
  onToggleEmptySections,
}: {
  handle: SortableHandleProps;
  projectId: string;
  name: string;
  done: number;
  total: number;
  showCompleted: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Prune section headers with no visible tasks in the expanded card. */
  hideEmptySections: boolean;
  onToggleEmptySections: () => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const project = useProject(store, projectId);
  const [editing, setEditing] = useState(false);
  const { navigate } = useSelection();

  const display = (project?.name ?? '') || name || 'Untitled';

  const classes = ['project-row', 'sortable-row'];
  if (handle.isDragging) classes.push('sortable-row-active');
  if (handle.isOver) classes.push('sortable-row-over');

  const openProject = (): void => {
    navigate({ kind: 'project', id: projectId });
  };

  return (
    <li
      ref={handle.ref}
      style={handle.style}
      className={classes.join(' ')}
      data-drag-over={handle.isOver ? 'true' : undefined}
    >
      <div className="project-row-line" onClick={openProject}>
        <button
          type="button"
          className="project-row-drag-handle"
          aria-label="Drag to reorder"
          title="Drag to reorder"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          {...(handle.attributes ?? {})}
          {...(handle.listeners ?? {})}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#drag-icon" />
          </svg>
        </button>
        <button
          type="button"
          className="project-row-caret"
          aria-label={collapsed ? `Expand ${display}` : `Collapse ${display}`}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand tasks' : 'Collapse tasks'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href={`/icons.svg#${collapsed ? 'chevron-right-icon' : 'chevron-down-icon'}`} />
          </svg>
        </button>
        {editing ? (
          <input
            type="text"
            className="project-row-name-input"
            aria-label="Project name"
            defaultValue={display}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const next = e.currentTarget.value.trim() || 'Untitled';
              if (next !== display) {
                store.setCell(TABLES.projects, projectId, COLUMNS.projects.name, next);
              }
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              else if (e.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            className="project-row-name"
            title="Open project"
            onClick={(e) => {
              e.stopPropagation();
              openProject();
            }}
          >
            {display}
          </button>
        )}
        {!editing && (
          <ProjectAddTaskButton
            projectId={projectId}
            display={display}
            onEnsureExpanded={() => {
              if (collapsed) onToggleCollapse();
            }}
          />
        )}
        <div className="project-row-actions">
          <ProjectRowActions
            projectId={projectId}
            display={display}
            hideEmptySections={hideEmptySections}
            onToggleEmptySections={onToggleEmptySections}
            onRename={() => setEditing(true)}
            onEnsureExpanded={() => {
              if (collapsed) onToggleCollapse();
            }}
          />
        </div >
        <ProjectProgressMeter done={done} total={total} />
      </div >
      {!collapsed && (
        <div className="project-row-tasks">
          <ProjectTaskList
            projectId={projectId}
            projectName={display}
            showCompleted={showCompleted}
            hideEmptySections={hideEmptySections}
          />
        </div>
      )
      }
    </li >
  );
}

function NotesSection({
  areaId,
}: {
  areaId: string;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { areaNotes, projectNotes, taskNotes } = useNotesForAreaTree(
    store,
    areaId,
  );
  const allIds = useMemo(
    () => [...areaNotes, ...projectNotes, ...taskNotes],
    [areaNotes, projectNotes, taskNotes],
  );

  return (
    <section className="notes-tab" aria-label="Notes">
      <ul className="notes-tab-list" role="list">
        {allIds.map((nid) => (
          <NoteLine key={nid} noteId={nid} />
        ))}
      </ul>
    </section>
  );
}

/** The "+" in the NOTES section header: reveals a focused input in the
 * header row itself. Creation lives here (not in NotesSection) because
 * the header is rendered by MainPane's CollapsibleSection. */
function AddNoteButton({ areaId, onOpen }: { areaId: string; onOpen: () => void }): React.JSX.Element {
  const { store } = useDataLayer();
  return (
    <InlineAddButton
      label="Add note"
      placeholder="New note…"
      inputAriaLabel="New note"
      className="area-tab-action-add"
      onSubmit={(title) =>
        createNote(store, { title, body: '', entityType: NOTE_ENTITY_TYPE.area, entityId: areaId })
      }
      onOpenChange={(open) => {
        if (open) onOpen();
      }}
    />
  );
}

function NoteLine({ noteId }: { noteId: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const note = useNote(store, noteId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Keyboard users enter edit mode via the note title button; move
  // focus into the textarea once it mounts.
  useEffect(() => {
    if (editing) bodyRef.current?.focus();
  }, [editing]);

  if (!note) return <></>;
  const body = note.body ?? '';
  const title = note.title || 'Untitled';

  return (
    <li className="note-line">
      <div className="note-line-head">
        <button
          type="button"
          className="note-line-title"
          onClick={() => {
            setDraft(body);
            setEditing(true);
          }}
        >
          {title}
        </button>
        <span className="note-line-preview">{stripPreview(body) || 'Empty note'}</span>
        <button
          type="button"
          className="note-line-action note-line-action-danger"
          aria-label="Delete note"
          title="Delete"
          onClick={() => setConfirmDelete(true)}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#trash-icon" />
          </svg>
        </button>
      </div>
      {!editing && body.trim().length > 0 && (
        <Suspense
          fallback={
            <div className="markdown-body note-line-rendered">
              {stripPreview(body)}
            </div>
          }
        >
          <NoteMarkdown
            body={body}
            onClick={() => {
              setDraft(body);
              setEditing(true);
            }}
          />
        </Suspense>
      )}
      {!editing && body.trim().length === 0 && (
        <button
          type="button"
          className="note-line-empty"
          onClick={() => {
            setDraft('');
            setEditing(true);
          }}
        >
          Add note text…
        </button>
      )}
      {editing && (
        <textarea
          ref={bodyRef}
          className="note-line-body"
          aria-label="Note body"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.max(3, draft.split('\n').length)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(false);
            else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.currentTarget.blur();
            }
          }}
          onBlur={() => {
            const next = draft;
            const cur = String(
              store.getCell(TABLES.notes, noteId, COLUMNS.notes.body) ?? '',
            );
            if (next !== cur) {
              if (next.trim().length === 0) {
                deleteNote(store, noteId);
              } else {
                store.setCell(TABLES.notes, noteId, COLUMNS.notes.body, next);
                store.setCell(
                  TABLES.notes,
                  noteId,
                  COLUMNS.notes.updatedAt,
                  new Date().toISOString(),
                );
              }
            }
            setEditing(false);
          }}
        />
      )}
      <ConfirmModal
        open={confirmDelete}
        title="Delete note?"
        message={`"${title}" will be deleted.`}
        confirmLabel="Delete"
        onConfirm={() => {
          deleteNote(store, noteId);
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </li>
  );
}

function ProjectPaneHeader({
  areaId,
  projectId,
  name,
  trailing,
  actions,
}: {
  areaId: string | null;
  projectId: string;
  name: string;
  /** Extra actions pinned to the header's right edge. */
  trailing?: React.ReactNode;
  /**
   * Presence opts the header into the project-row chrome the area-view
   * card carries — progress meter plus the due-date / empty-sections /
   * notes / rename / delete cluster — so the detail pane is the
   * standalone form of the card. The notes pane omits it.
   */
  actions?: {
    hideEmptySections: boolean;
    onToggleEmptySections: () => void;
  };
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const areaRowIds = useRowIds(TABLES.areas, store);
  const rollups = useProjectRollups(store);
  const [editing, setEditing] = useState(false);
  const chain = useMemo<readonly Area[]>(() => {
    if (!areaId) return [];
    void areaRowIds.length;
    const direct = getArea(store, areaId);
    if (!direct) return [];
    const ancestors = buildParentChain(store, direct.id);
    return [...ancestors, direct];
  }, [store, areaId, areaRowIds]);
  const showSlash = chain.length > 0;
  const display = name || 'Untitled';
  const rollup = rollups.find((r) => r.projectId === projectId);
  return (
    <div className="area-header">
      {chain.map((p, i) => (
        <Fragment key={p.id}>
          {i > 0 && (
            <span className="area-header-crumb-sep" aria-hidden="true">
              /
            </span>
          )}
          <button
            type="button"
            className="area-header-crumb"
            onClick={() => navigate({ kind: 'area', id: p.id })}
          >
            <span
              className="area-header-name-edit-dot"
              style={{ background: areaColorHex(p.color) }}
              aria-hidden="true"
            />
            <span>{p.name || 'Untitled'}</span>
          </button>
        </Fragment>
      ))}
      {showSlash && (
        <span className="area-header-crumb-sep" aria-hidden="true">
          /
        </span>
      )}
      <svg
        className="svg-icon area-header-project-icon"
        aria-hidden="true"
      >
        <use href="/icons.svg#project-list-icon" />
      </svg>
      {editing && actions ? (
        <input
          type="text"
          className="area-header-add-input"
          aria-label="Project name"
          defaultValue={display}
          autoFocus
          onBlur={(e) => {
            const next = e.currentTarget.value.trim() || 'Untitled';
            if (next !== display) {
              store.setCell(TABLES.projects, projectId, COLUMNS.projects.name, next);
            }
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            else if (e.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <h1 className="area-header-name">{display}</h1>
      )}
      {actions && !editing && (
        <ProjectAddTaskButton projectId={projectId} display={display} />
      )}
      {actions && (
        <div className="project-row-actions">
          <ProjectRowActions
            projectId={projectId}
            display={display}
            hideEmptySections={actions.hideEmptySections}
            onToggleEmptySections={actions.onToggleEmptySections}
            onRename={() => setEditing(true)}
            onAfterDelete={() => {
              navigate(areaId ? { kind: 'area', id: areaId } : INBOX);
            }}
          />
          <ProjectProgressMeter done={rollup?.done ?? 0} total={rollup?.total ?? 0} />
        </div>
      )}
      {trailing && <div className="area-header-actions">{trailing}</div>}
    </div>
  );
}

/**
 * Project detail pane — the standalone form of an expanded project card
 * in the area view (`#/p/<id>`, reached by clicking a project row). The
 * header carries the area breadcrumb and the same row-action cluster
 * the card shows (progress, due date, empty-sections toggle, notes,
 * rename, delete) next to the shared Completed toggle; the body is the
 * same sectioned `ProjectTaskList` the card expands into. Project-
 * scoped notes stay in the notes pane. The empty-sections state comes
 * from the parent `MainPane` — one hook instance per screen, so the
 * card and this pane never disagree.
 */
function ProjectPane({
  projectId,
  hiddenEmptySections,
}: {
  projectId: string;
  /** MainPane's instance — shared so a toggle here reads back on the card. */
  hiddenEmptySections: CollapsedSet;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const project = useProject(store, projectId);
  const taskCount = useTasksForProjectDeep(store, projectId).length;
  const { showCompleted, toggle: toggleCompleted } = useShowCompleted();
  const hideEmptySections = hiddenEmptySections.collapsed.has(projectId);

  if (!project) {
    return (
      <main className="main" aria-label="Editor">
        <div className="main-body">
          <div className="main-empty">
            <h2>Welcome to LocalAction</h2>
            <p>This project no longer exists.</p>
          </div>
        </div>
      </main>
    );
  }

  const projectName = project.name || 'Untitled';

  return (
    <main className="main" aria-label="Editor">
      <div className="main-body">
        <ProjectPaneHeader
          areaId={project.areaId}
          projectId={projectId}
          name={projectName}
          actions={{
            hideEmptySections,
            onToggleEmptySections: () => hiddenEmptySections.toggle(projectId),
          }}
          trailing={
            <CompletedToggle showCompleted={showCompleted} onToggle={toggleCompleted} />
          }
        />
        <section className="pane-section pane-section-static" aria-label="Tasks">
          <div className="pane-section-head">
            <span className="pane-section-static-label">
              <span className="pane-section-title">Tasks</span>
              <span className="tab-group-count">· {taskCount}</span>
            </span>
            <button
              type="button"
              className="area-tab-action area-tab-action-add"
              aria-label={`Add task to ${projectName}`}
              title="Add task"
              onClick={() => {
                const id = createTask(store, {
                  title: '',
                  placement: { kind: 'project', id: projectId },
                });
                queueTaskTitleFocus(id);
              }}
            >
              <svg className="svg-icon" aria-hidden="true">
                <use href="/icons.svg#add-icon" />
              </svg>
            </button>
          </div>
          <div className="tasks-tab project-pane-tasks">
            <ProjectTaskList
              projectId={projectId}
              projectName={projectName}
              showCompleted={showCompleted}
              hideEmptySections={hideEmptySections}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

/**
 * Notes-only pane for a single project — reached via the note icon on
 * a project row. This is where project-scoped notes are created; the
 * area view's Notes tab only rolls them up for display.
 */
function ProjectNotesPane({ projectId }: { projectId: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const project = useProject(store, projectId);
  const [noteIds, setNoteIds] = useState<string[]>(() => {
    const ids: string[] = [];
    collectNoteIds(store, projectId, ids);
    return ids;
  });
  useEffect(() => {
    const refresh = (): void => {
      const ids: string[] = [];
      collectNoteIds(store, projectId, ids);
      setNoteIds(ids);
    };
    refresh();
    const listenerId = store.addDidFinishTransactionListener(refresh);
    return () => {
      store.delListener(listenerId);
    };
  }, [store, projectId]);

  function addNote(title: string): void {
    createNote(store, {
      title,
      body: '',
      entityType: NOTE_ENTITY_TYPE.project,
      entityId: projectId,
    });
  }

  const addInputRef = useRef<HTMLInputElement>(null);
  const wasEmpty = useRef(noteIds.length === 0);
  useEffect(() => {
    const empty = noteIds.length === 0;
    if (empty || wasEmpty.current) addInputRef.current?.focus();
    wasEmpty.current = empty;
  }, [noteIds.length]);

  if (!project) {
    return (
      <main className="main" aria-label="Editor">
        <div className="main-body">
          <div className="main-empty">
            <h2>Welcome to LocalAction</h2>
            <p>This project no longer exists.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="main" aria-label="Editor">
      <div className="main-body">
        <ProjectPaneHeader
          areaId={project.areaId}
          projectId={projectId}
          name={project.name || 'Untitled'}
        />
        <section className="notes-tab" aria-label="Notes">
          <ul className="notes-tab-list" role="list">
            {noteIds.map((nid) => (
              <NoteLine key={nid} noteId={nid} />
            ))}
          </ul>
          <InlineAddInput
            ref={addInputRef}
            placeholder={
              noteIds.length === 0
                ? 'No notes yet — add the first one.'
                : 'New note…'
            }
            ariaLabel="New note"
            onSubmit={addNote}
          />
        </section>
      </div>
    </main>
  );
}

function InboxPane(): React.JSX.Element {
  const { store } = useDataLayer();
  const topLevelIds = useInboxTaskIds(store);
  // TaskTreeByStatus builds the tree itself — feed it the flat deep
  // list (top-level + descendants), same as the project/area tabs.
  const allIds = useMemo(() => {
    const out: string[] = [];
    for (const t of topLevelIds) {
      out.push(t);
      collectChildIds(store, t, out);
    }
    return out;
  }, [topLevelIds, store]);
  const { showCompleted, toggle: toggleCompleted } = useShowCompleted();
  function addTask(title: string): void {
    createTask(store, { title });
  }
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
  const addInputRef = useRef<HTMLInputElement>(null);
  const wasEmpty = useRef(allIds.length === 0);
  useEffect(() => {
    const empty = allIds.length === 0;
    if (empty || wasEmpty.current) addInputRef.current?.focus();
    wasEmpty.current = empty;
  }, [allIds.length]);
  return (
    <main className="main" aria-label="Inbox">
      <div className="main-body">
        <header className="main-pane-header">
          <h2 className="main-pane-title">Inbox</h2>
          <CompletedToggle showCompleted={showCompleted} onToggle={toggleCompleted} />
        </header>
        <section className="tasks-tab" aria-label="Inbox tasks">
          <TaskTreeByStatus
            ids={allIds}
            onMove={onMove}
            ariaLabel="Inbox tasks"
            showCompleted={showCompleted}
          />
          <InlineAddInput
            ref={addInputRef}
            placeholder={
              allIds.length === 0
                ? 'No inbox tasks yet — add the first one.'
                : 'New inbox task…'
            }
            ariaLabel="New inbox task"
            onSubmit={addTask}
          />
        </section>
      </div>
    </main>
  );
}

/**
 * The selected area's task band — the area-level "ungrouped" inbox —
 * followed by one labeled group per sub-area that roots its own tasks.
 * Writable: the area's own tasks are created with `placement: area:<id>`,
 * edited, checked off, and drag-reordered in place; each sub-area group
 * is the same editable tree scoped to that sub-area's placement (a root
 * drop inside a group maps back to its own sub-area). Rendered through
 * TaskTreeByStatus so sub-tasks nest correctly and `onMove` can
 * re-parent within a band.
 */
function AreaTasksSection({
  areaId,
  subAreas,
  showCompleted,
  collapsed,
  onToggleCollapse,
}: {
  areaId: string;
  subAreas: readonly SubAreaRef[];
  showCompleted: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const topLevelIds = useAreaTaskIds(store, areaId);
  // TaskTreeByStatus builds the tree itself — feed it the flat deep
  // list (top-level + descendants), same as the inbox.
  const allIds = useMemo(() => {
    const out: string[] = [];
    for (const t of topLevelIds) {
      out.push(t);
      collectChildIds(store, t, out);
    }
    return out;
  }, [topLevelIds, store]);
  function onMove(
    activeId: string,
    parentId: string | null,
    beforeId: string | undefined,
  ): void {
    moveTask(
      store,
      activeId,
      parentId ? `task${PLACEMENT_SEP}${parentId}` : `area${PLACEMENT_SEP}${areaId}`,
      beforeId,
    );
  }
  const visibleTopLevel = showCompleted
    ? topLevelIds.length
    : topLevelIds.filter(
      (tid) => getEffectiveTaskStatus(store, tid) !== TASK_STATUS.done,
    ).length;
  // The section count covers the whole subtree, matching the Projects
  // and Notes section-count convention. Sub-area top-level ids are read
  // imperatively (one hook per sub-area can't loop), so the tasks table
  // version joins the memo deps as the invalidation token.
  const tasksV = useTableVersion(store, TABLES.tasks);
  const visibleSubAreaCount = useMemo(() => {
    void tasksV; // invalidation token: task edits re-run the subtree count
    let n = 0;
    for (const sa of subAreas) {
      const tops = getAreaTaskIds(store, sa.id);
      n += showCompleted
        ? tops.length
        : tops.filter((tid) => getEffectiveTaskStatus(store, tid) !== TASK_STATUS.done).length;
    }
    return n;
  }, [store, tasksV, subAreas, showCompleted]);
  return (
    <CollapsibleSection
      title="Area tasks"
      icon="tasks"
      count={visibleTopLevel + visibleSubAreaCount}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      trailing={
        <button
          type="button"
          className="area-tab-action area-tab-action-add"
          aria-label="Add task"
          title="Add task"
          onClick={() => {
            if (collapsed) onToggleCollapse();
            const id = createTask(store, { title: '', placement: { kind: 'area', id: areaId } });
            queueTaskTitleFocus(id);
          }}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#add-icon" />
          </svg>
        </button>
      }
    >
      <TaskTreeByStatus
        ids={allIds}
        onMove={onMove}
        ariaLabel="Area tasks"
        showCompleted={showCompleted}
      />
      {subAreas.map((sa) => (
        <SubAreaTaskGroup
          key={sa.id}
          areaId={sa.id}
          name={sa.name}
          showCompleted={showCompleted}
        />
      ))}
    </CollapsibleSection>
  );
}

/**
 * One rolled-in sub-area's area-rooted tasks inside the viewed area's
 * Area tasks section: the same editable tree as the area's own band,
 * scoped to the sub-area's placement — a root drop inside the group
 * re-parents to that sub-area, never to the viewed area. Labeled by the
 * sub-area's name; hidden while the sub-area has no visible tasks.
 */
function SubAreaTaskGroup({
  areaId,
  name,
  showCompleted,
}: {
  areaId: string;
  name: string;
  showCompleted: boolean;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const topLevelIds = useAreaTaskIds(store, areaId);
  const allIds = useMemo(() => {
    const out: string[] = [];
    for (const t of topLevelIds) {
      out.push(t);
      collectChildIds(store, t, out);
    }
    return out;
  }, [topLevelIds, store]);
  const visibleTopLevel = showCompleted
    ? topLevelIds.length
    : topLevelIds.filter(
      (tid) => getEffectiveTaskStatus(store, tid) !== TASK_STATUS.done,
    ).length;
  if (visibleTopLevel === 0) return null;
  function onMove(
    activeId: string,
    parentId: string | null,
    beforeId: string | undefined,
  ): void {
    moveTask(
      store,
      activeId,
      parentId ? `task${PLACEMENT_SEP}${parentId}` : `area${PLACEMENT_SEP}${areaId}`,
      beforeId,
    );
  }
  return (
    <Group title={name} count={visibleTopLevel}>
      <TaskTreeByStatus
        ids={allIds}
        onMove={onMove}
        ariaLabel={`Area tasks in ${name}`}
        showCompleted={showCompleted}
      />
    </Group>
  );
}


function stripPreview(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '';
  const first = trimmed.split('\n', 1)[0] ?? '';
  return first.length > 140 ? `${first.slice(0, 140)}…` : first;
}

function collectChildIds(
  store: MergeableStore,
  parentId: string,
  out: string[],
): void {
  if (!parentId) return;
  for (const id of store.getRowIds(TABLES.tasks)) {
    const p = getPlacement(store, id);
    if (p.kind === 'task' && p.id === parentId) {
      out.push(id);
      collectChildIds(store, id, out);
    }
  }
}

function collectNoteIds(
  store: MergeableStore,
  projectId: string,
  out: string[],
): void {
  for (const id of store.getRowIds(TABLES.notes)) {
    if (store.getCell(TABLES.notes, id, COLUMNS.notes.entityType) !== NOTE_ENTITY_TYPE.project) continue;
    if (store.getCell(TABLES.notes, id, COLUMNS.notes.entityId) !== projectId) continue;
    out.push(id);
  }
}
