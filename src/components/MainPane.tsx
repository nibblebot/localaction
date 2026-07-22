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
  useNotesForAreaTree,
  createProject,
  createTask,
  createNote,
  createArea,
  getArea,
  deleteProject,
  deleteArea,
  deleteNote,
  captureSubtree,
  restoreSubtree,
  reorderProject,
  moveTask,
  PLACEMENT_SEP,
  getEffectiveTaskStatus,
  sortTaskIds,
  TABLES,
  TASK_STATUS,
  NOTE_ENTITY_TYPE,
  COLUMNS,
  getPlacement,
  useInboxTaskIds,
  useAreaTaskIds,
  usePeopleForEntity,
  useHiddenCount,
  peopleForEntity,
  useEntityPersonIds,
  usePerson,
} from '../data/index.ts';
import type { Area, NoteEntityType, ProjectRollup } from '../data/index.ts';
import type { MergeableStore } from 'tinybase';
import { useSelection } from './useSelection.ts';
import { useUndo } from './useUndo.ts';
import { INBOX } from '../router.ts';
import ConfirmModal from './ConfirmModal.tsx';
import AreaEditPopover from './AreaEditPopover.tsx';
import InlineAddInput from './InlineAddInput.tsx';
import { areaColorHex } from '../data/colors.ts';
import type { AreaColorId } from '../data/colors.ts';
import { SortableList } from './SortableList.tsx';
import type { SortableHandleProps } from './SortableList.tsx';
import { TaskList, TaskTreeByStatus } from './TaskList.tsx';
import ProjectTaskList from './ProjectTaskList.tsx';
import Group from './Group.tsx';
import PersonFilterBanner from './persons/PersonFilterBanner.tsx';
import PersonAssignmentButton from './persons/PersonAssignmentButton.tsx';
import ProjectDueDateButton from './ProjectDueDateButton.tsx';
import PersonAssignmentPopover from './persons/PersonAssignmentPopover.tsx';
import PersonAvatar from './persons/PersonAvatar.tsx';
import { usePersonFilter } from './persons/usePersonFilter.ts';
import { useShowCompleted } from './useShowCompleted.ts';
import { useCollapsedProjects } from './useCollapsedProjects.ts';

type Tab = 'projects' | 'notes';
const TABS: { id: Tab; label: string }[] = [
  { id: 'projects', label: 'Projects' },
  { id: 'notes', label: 'Notes' },
];

// Lazy: carries markdown-it (~100KB min) out of the main chunk —
// loaded on first note-preview render, never on task-only surfaces.
const NoteMarkdown = lazy(() => import('./NoteMarkdown.tsx'));

export default function MainPane(): React.JSX.Element {
  const { store } = useDataLayer();
  const { selection, navigate } = useSelection();
  const counts = useAreaCounts(store);
  const areaRowIds = useRowIds(TABLES.areas, store);

  const areaId = selection.kind === 'area' ? selection.id : null;
  const area = useArea(store, areaId ?? undefined);

  const [tabByArea, setTabByArea] = useState<Record<string, Tab>>({});
  const tab: Tab = (areaId ? tabByArea[areaId] : undefined) ?? 'projects';
  const setTab = (next: Tab): void => {
    if (!areaId) return;
    setTabByArea((prev) => ({ ...prev, [areaId]: next }));
  };
  const { showCompleted, toggle: toggleCompleted } = useShowCompleted();
  const collapsedProjects = useCollapsedProjects();

  const parentChain = useMemo<readonly Area[]>(() => {
    if (!areaId) return [];
    void areaRowIds.length;
    return buildParentChain(store, areaId);
  }, [store, areaId, areaRowIds]);

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
        out.push({ id: k.id, name: k.name });
        walk(k.id);
      }
    };
    walk(areaId);
    return out;
  }, [counts, areaId]);

   if (selection.kind === 'project-notes') {
     return <ProjectNotesPane projectId={selection.id} />;
   }

  if (selection.kind === 'inbox') {
    return <InboxPane />;
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

  const isTopLevel = parentChain.length === 0;

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
          showAddSubArea={isTopLevel}
          onNavigate={goToArea}
          onCreateSubArea={isTopLevel ? addSubArea : null}
          onDeleteArea={goToInbox}
        />
        <PersonFilterBanner />
        <PaneTabs
          tabs={TABS}
          tab={tab}
          onChange={setTab}
          counts={{ projects: projectCount, notes: noteCount }}
          showCompleted={showCompleted}
          onToggleCompleted={toggleCompleted}
          trailing={
            <ProjectCollapseAllButton
              areaId={areaId}
              subAreas={subAreas}
              collapsed={collapsedProjects.collapsed}
              replace={collapsedProjects.replace}
            />
          }
        />
        {tab === 'projects' && (
          <ProjectsTab
            areaId={areaId}
            subAreas={subAreas}
            isActive
            showCompleted={showCompleted}
            collapsed={collapsedProjects.collapsed}
            onToggleCollapse={collapsedProjects.toggle}
          />
        )}
        {tab === 'notes' && (
          <NotesTab areaId={areaId} isActive />
        )}
      </div>
    </main>
  );
}

function AreaHeader({
  areaId,
  name,
  color,
  parentChain,
  showAddSubArea,
  onNavigate,
  onCreateSubArea,
  onDeleteArea,
}: {
  areaId: string;
  name: string;
  color: AreaColorId;
  parentChain: readonly Area[];
  showAddSubArea: boolean;
  onNavigate: (id: string) => void;
  onCreateSubArea: ((name: string) => void) | null;
  onDeleteArea: () => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const hex = areaColorHex(color);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editAnchor, setEditAnchor] = useState<{ x: number; y: number } | null>(null);
  const cast = usePeopleForEntity(store, NOTE_ENTITY_TYPE.area, areaId);
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
    onCreateSubArea?.(trimmed);
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
            {p.name || 'Untitled'}
          </button>
        </Fragment>
      ))}
      {parentChain.length > 0 && (
        <span className="area-header-slash" aria-hidden="true" style={{ color: hex }}>
          /
        </span>
      )}
      <span
        className="area-header-dot"
        style={{ background: hex }}
        aria-hidden="true"
      />
      <h1 className="area-header-name">
        <button
          type="button"
          className="area-header-name-edit"
          onClick={openEditor}
          title="Edit area"
          aria-haspopup="dialog"
          aria-expanded={editAnchor !== null}
        >
          {name || 'Untitled'}
        </button>
      </h1>
      <AreaHeaderCast areaId={areaId} cast={cast} />
      {showAddSubArea && onCreateSubArea && (
        adding ? (
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
        )
      )}
      <button
        type="button"
        className="area-header-edit"
        onClick={openEditor}
        aria-label="Edit area"
        title="Edit area"
        aria-haspopup="dialog"
        aria-expanded={editAnchor !== null}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#edit-icon" />
        </svg>
      </button>
      <button
        type="button"
        className="area-header-delete"
        onClick={() => setConfirmDelete(true)}
        aria-label="Delete area"
        title="Delete area"
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#trash-icon" />
        </svg>
      </button>
      <AreaEditPopover
        anchor={editAnchor}
        areaId={areaId}
        name={name}
        color={color}
        onClose={() => setEditAnchor(null)}
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

function AreaHeaderCast({
  areaId,
  cast,
}: {
  areaId: string;
  cast: readonly string[];
}): React.JSX.Element {
  const { store } = useDataLayer();
  const current = useEntityPersonIds(store, NOTE_ENTITY_TYPE.area, areaId);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  return (
    <>
      <div ref={containerRef} className="area-header-cast" aria-label="Cast">
        {cast.map((pid) => (
          <CastChip
            key={pid}
            personId={pid}
            store={store}
            expanded={anchor !== null}
            onEdit={() => {
              const r = containerRef.current?.getBoundingClientRect();
              setAnchor({ x: r ? r.left : 0, y: r ? r.bottom + 4 : 0 });
            }}
          />
        ))}
      </div>
      <PersonAssignmentPopover
        anchor={anchor}
        entityType={NOTE_ENTITY_TYPE.area}
        entityId={areaId}
        current={current}
        title="Cast"
        onClose={() => setAnchor(null)}
      />
    </>
  );
}


function CastChip({
  personId,
  store,
  expanded,
  onEdit,
}: {
  personId: string;
  store: MergeableStore;
  expanded: boolean;
  onEdit: () => void;
}): React.JSX.Element | null {
  // usePerson subscribes to the row's name/color cells so the chip
  // re-renders on rename/recolor.
  const person = usePerson(store, personId);
  if (!person) return null;
  return (
    <button
      type="button"
      className="area-header-cast-chip"
      onClick={onEdit}
      title="Edit cast"
      aria-haspopup="dialog"
      aria-expanded={expanded}
    >
      <PersonAvatar name={person.name} color={person.color} small />
      <span className="area-header-cast-chip-name">{person.name || 'Untitled'}</span>
    </button>
  );
}
 function buildParentChain(store: MergeableStore, areaId: string): Area[] {
  const chain: Area[] = [];
  const seen = new Set<string>([areaId]);
  let cur = getArea(store, areaId);
  while (cur && cur.parentId && !seen.has(cur.parentId)) {
    const parent = getArea(store, cur.parentId);
    if (!parent) break;
    chain.push(parent);
    seen.add(parent.id);
    cur = parent;
  }
  return chain.reverse();
}

interface PaneTabsProps<T extends string> {
  tabs: readonly { id: T; label: string }[];
  tab: T;
  onChange: (tab: T) => void;
  counts: Record<T, number>;
  /** Completed-task visibility toggle (task tabs only). */
  showCompleted?: boolean;
  onToggleCompleted?: () => void;
  /** Extra action rendered after the completed toggle. */
  trailing?: React.ReactNode;
}

/**
 * Completed-task visibility toggle, shared by the pane tab bars and the
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

function PaneTabs<T extends string>({
  tabs,
  tab,
  onChange,
  counts,
  showCompleted,
  onToggleCompleted,
  trailing,
}: PaneTabsProps<T>): React.JSX.Element {
  return (
    <div className="area-tabs" role="tablist">
      {tabs.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`area-tab-${t.id}`}
            aria-controls={`area-tabpanel-${t.id}`}
            aria-selected={active}
            className={`area-tab${active ? ' area-tab-active' : ''}`}
            onClick={() => onChange(t.id)}
          >
            <span className="area-tab-label">{t.label}</span>
            <span className="area-tab-count">{counts[t.id]}</span>
          </button>
        );
      })}
      <div className="area-tabs-spacer" />
      {onToggleCompleted && (
        <CompletedToggle showCompleted={showCompleted ?? false} onToggle={onToggleCompleted} />
      )}
      {trailing}
    </div>
  );
}

interface SubAreaRef {
  id: string;
  name: string;
}

/**
 * Collapse-all / expand-all for the combined Projects tab. Operates on
 * every project rolled into the view (the area plus its sub-areas);
 * hidden by the person filter ids are harmless to include.
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

function ProjectsTab({
  areaId,
  subAreas,
  isActive,
  showCompleted,
  collapsed,
  onToggleCollapse,
}: {
  areaId: string;
  subAreas: readonly SubAreaRef[];
  isActive: boolean;
  showCompleted: boolean;
  collapsed: ReadonlySet<string>;
  onToggleCollapse: (id: string) => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const rollups = useProjectRollups(store);
  const inArea = useMemo(
    () => rollups.filter((r) => r.areaId === areaId),
    [rollups, areaId],
  );

  function addProject(name: string): void {
    createProject(store, { name, areaId });
  }

  const addInputRef = useRef<HTMLInputElement>(null);
  const wasEmpty = useRef(inArea.length === 0);
  useEffect(() => {
    if (!isActive) return;
    const empty = inArea.length === 0;
    if (empty || wasEmpty.current) addInputRef.current?.focus();
    wasEmpty.current = empty;
  }, [isActive, inArea.length]);

  return (
    <section
      className="projects-tab"
      aria-label="Projects"
      role="tabpanel"
      id="area-tabpanel-projects"
      aria-labelledby="area-tab-projects"
    >
      <AreaTasksSection areaId={areaId} showCompleted={showCompleted} />
      <AreaProjectGroups
        areaId={areaId}
        rollups={rollups}
        showCompleted={showCompleted}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
      {subAreas.map((sa) => (
        <SubAreaProjects
          key={sa.id}
          areaId={sa.id}
          name={sa.name}
          rollups={rollups}
          showCompleted={showCompleted}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
        />
      ))}
      <InlineAddInput
        ref={addInputRef}
        placeholder={
          inArea.length === 0
            ? 'No projects yet — add the first one.'
            : 'New project…'
        }
        ariaLabel="New project"
        onSubmit={addProject}
      />
    </section>
  );
}

/**
 * ACTIVE / DONE project groups for a single area, with the person filter
 * applied. Reused for the area itself and for each sub-area rolled into
 * the view.
 */
function AreaProjectGroups({
  areaId,
  rollups,
  showCompleted,
  collapsed,
  onToggleCollapse,
}: {
  areaId: string;
  rollups: ProjectRollup[];
  showCompleted: boolean;
  collapsed: ReadonlySet<string>;
  onToggleCollapse: (id: string) => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const inArea = useMemo(
    () =>
      rollups
        .filter((r) => r.areaId === areaId)
        .sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          return a.projectName.localeCompare(b.projectName);
        }),
    [rollups, areaId],
  );

  function onReorder(activeId: string, beforeId: string | undefined): void {
    reorderProject(store, activeId, beforeId);
  }

  const { selected: filter } = usePersonFilter();
  const projectIds = inArea.map((p) => p.projectId);
  const hiddenCount = useHiddenCount(
    store,
    NOTE_ENTITY_TYPE.project,
    projectIds,
    filter,
  );
  // person_links/persons changes must re-run the imperative
  // peopleForEntity filter below — the token joins the memo deps.
  const personsV =
    useTableVersion(store, TABLES.persons) + useTableVersion(store, TABLES.person_links);
  const visible = useMemo(() => {
    void personsV; // invalidation token: person_links/persons edits re-run the peopleForEntity filter
    if (filter.length === 0) return inArea;
    const set = new Set(filter);
    return inArea.filter((p) => {
      for (const id of peopleForEntity(store, NOTE_ENTITY_TYPE.project, p.projectId)) {
        if (set.has(id)) return true;
      }
      return false;
    });
  }, [store, inArea, filter, personsV]);

  const done = visible.filter((p) => p.total > 0 && p.done === p.total);
  const active = visible.filter((p) => p.total === 0 || p.done < p.total);

  return (
    <>
      {active.length > 0 && (
        <Group title="Active" count={active.length}>
          <SortableList
            itemIds={active.map((p) => p.projectId)}
            onReorder={onReorder}
            ariaLabel="Active projects"
            className="sortable-list"
          >
            {(projectId, handle) => {
              const p = active.find((x) => x.projectId === projectId);
              if (!p) return <></>;
              return (
                <SortableProjectRow
                  handle={handle}
                  projectId={p.projectId}
                  name={p.projectName}
                  done={p.done}
                  total={p.total}
                  showCompleted={showCompleted}
                  collapsed={collapsed.has(p.projectId)}
                  onToggleCollapse={() => onToggleCollapse(p.projectId)}
                />
              );
            }}
          </SortableList>
        </Group>
      )}
      {done.length > 0 && (
        <Group title="Done" count={done.length}>
          {done.map((p) => (
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
            />
          ))}
        </Group>
      )}
      {hiddenCount > 0 && (
        <p className="hidden-stub">
          {hiddenCount} {hiddenCount === 1 ? 'project' : 'projects'} hidden
        </p>
      )}
    </>
  );
}

/** A sub-area's area-rooted tasks and project groups, rolled into the
 * parent area's combined Projects tab. */
function SubAreaProjects({
  areaId,
  name,
  rollups,
  showCompleted,
  collapsed,
  onToggleCollapse,
}: {
  areaId: string;
  name: string;
  rollups: ProjectRollup[];
  showCompleted: boolean;
  collapsed: ReadonlySet<string>;
  onToggleCollapse: (id: string) => void;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const areaTaskIds = useAreaTaskIds(store, areaId);
  if (!rollups.some((r) => r.areaId === areaId) && areaTaskIds.length === 0) return null;
  return (
    <div className="subarea-section">
      <SubAreaHeader areaId={areaId} name={name} />
      <AreaTasksSection areaId={areaId} showCompleted={showCompleted} />
      <AreaProjectGroups
        areaId={areaId}
        rollups={rollups}
        showCompleted={showCompleted}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
    </div>
  );
}

/** Clickable heading for a rolled-in sub-area section. */
function SubAreaHeader({
  areaId,
  name,
}: {
  areaId: string;
  name: string;
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
        {name || 'Untitled'}
      </button>
    </header>
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
}: {
  projectId: string;
  name: string;
  done: number;
  total: number;
  doneGroup?: boolean;
  showCompleted: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const project = useProject(store, projectId);
  const { offerUndo } = useUndo();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const display = (project?.name ?? '') || name || 'Untitled';

  return (
    <li className={`project-row${doneGroup ? ' project-row-done' : ''}`}>
      <div className="project-row-line">
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
            title={collapsed ? 'Expand tasks' : 'Collapse tasks'}
            aria-expanded={!collapsed}
            onClick={onToggleCollapse}
          >
            {display}
          </button>
        )}
        <div className="project-row-progress" aria-label={`${done} of ${total} tasks done`}>
          <div
            className={`project-row-progress-bar${
              doneGroup ? ' project-row-progress-done' : ''
            }`}
          >
            <div className="project-row-progress-fill" style={{ transform: `scaleX(${pct / 100})` }} />
          </div>
          <span className="project-row-progress-count">
            {done} / {total}
          </span>
        </div>
        <ProjectDueDateButton projectId={projectId} />
        <PersonAssignmentButton
          entityType={NOTE_ENTITY_TYPE.project}
          entityId={projectId}
        />
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
            setEditing(true);
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
        </div>
      {!collapsed && (
        <div className="project-row-tasks">
          <ProjectTaskList projectId={projectId} projectName={display} showCompleted={showCompleted} />
        </div>
      )}
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
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </li>
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
}: {
  handle: SortableHandleProps;
  projectId: string;
  name: string;
  done: number;
  total: number;
  showCompleted: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const project = useProject(store, projectId);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { navigate } = useSelection();
  const { offerUndo } = useUndo();

  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const display = (project?.name ?? '') || name || 'Untitled';

  const classes = ['project-row', 'sortable-row'];
  if (handle.isDragging) classes.push('sortable-row-active');
  if (handle.isOver) classes.push('sortable-row-over');

  return (
    <li
      ref={handle.ref}
      style={handle.style}
      className={classes.join(' ')}
      data-drag-over={handle.isOver ? 'true' : undefined}
    >
      <div className="project-row-line">
        <button
          type="button"
          className="project-row-drag-handle"
          aria-label="Drag to reorder"
          title="Drag to reorder"
          onClick={(e) => e.preventDefault()}
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
            title={collapsed ? 'Expand tasks' : 'Collapse tasks'}
            aria-expanded={!collapsed}
            onClick={onToggleCollapse}
          >
            {display}
          </button>
        )}
        <div className="project-row-progress" aria-label={`${done} of ${total} tasks done`}>
          <div className="project-row-progress-bar">
            <div className="project-row-progress-fill" style={{ transform: `scaleX(${pct / 100})` }} />
          </div>
          <span className="project-row-progress-count">
            {done} / {total}
          </span>
        </div>
        <ProjectDueDateButton projectId={projectId} />
        <PersonAssignmentButton
          entityType={NOTE_ENTITY_TYPE.project}
          entityId={projectId}
        />
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
            setEditing(true);
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
      </div>
      {!collapsed && (
        <div className="project-row-tasks">
          <ProjectTaskList projectId={projectId} projectName={display} showCompleted={showCompleted} />
        </div>
      )}
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
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </li>
  );
}

function NotesTab({
  areaId,
  isActive,
}: {
  areaId: string;
  isActive: boolean;
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
  const { selected: filter } = usePersonFilter();
  const hiddenCount = useHiddenCount(store, NOTE_ENTITY_TYPE.area, allIds, filter);
  const personsV =
    useTableVersion(store, TABLES.persons) + useTableVersion(store, TABLES.person_links);
  const visible = useMemo(() => {
    void personsV; // invalidation token: person_links/persons edits re-run the peopleForEntity filter
    if (filter.length === 0) return allIds;
    const set = new Set(filter);
    return allIds.filter((nid) => {
      const noteEntityType = String(
        store.getCell(TABLES.notes, nid, COLUMNS.notes.entityType) ?? '',
      );
      const noteEntityId = String(
        store.getCell(TABLES.notes, nid, COLUMNS.notes.entityId) ?? '',
      );
      if (!noteEntityId || noteEntityType === '') return false;
      for (const id of peopleForEntity(
        store,
        noteEntityType as NoteEntityType,
        noteEntityId,
      )) {
        if (set.has(id)) return true;
      }
      return false;
    });
  }, [store, allIds, filter, personsV]);


  function addNote(title: string): void {
    createNote(store, {
      title,
      body: '',
      entityType: NOTE_ENTITY_TYPE.area,
      entityId: areaId,
    });
  }

  const addInputRef = useRef<HTMLInputElement>(null);
  const wasEmpty = useRef(allIds.length === 0);
  useEffect(() => {
    if (!isActive) return;
    const empty = allIds.length === 0;
    if (empty || wasEmpty.current) addInputRef.current?.focus();
    wasEmpty.current = empty;
  }, [isActive, allIds.length]);

  return (
    <section
      className="notes-tab"
      aria-label="Notes"
      role="tabpanel"
      id="area-tabpanel-notes"
      aria-labelledby="area-tab-notes"
    >
      <ul className="notes-tab-list" role="list">
        {visible.map((nid) => (
          <NoteLine key={nid} noteId={nid} />
        ))}
      </ul>
      <InlineAddInput
        ref={addInputRef}
        placeholder={
          allIds.length === 0
            ? 'No notes yet — add the first one.'
            : 'New note…'
        }
        ariaLabel="New note"
        onSubmit={addNote}
      />
      {hiddenCount > 0 && (
        <p className="hidden-stub">
          {hiddenCount} {hiddenCount === 1 ? 'note' : 'notes'} hidden
        </p>
      )}
    </section>
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
}: {
  areaId: string | null;
  projectId: string;
  name: string;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const areaRowIds = useRowIds(TABLES.areas, store);
  const chain = useMemo<readonly Area[]>(() => {
    if (!areaId) return [];
    void areaRowIds.length;
    const direct = getArea(store, areaId);
    if (!direct) return [];
    const ancestors = buildParentChain(store, direct.id);
    return [...ancestors, direct];
  }, [store, areaId, areaRowIds]);
  const showSlash = chain.length > 0;
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
            {p.name || 'Untitled'}
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
      <h1 className="area-header-name">{name || 'Untitled'}</h1>
      <PersonAssignmentButton
        entityType={NOTE_ENTITY_TYPE.project}
        entityId={projectId}
      />
    </div>
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

  const { selected: filter } = usePersonFilter();
  const hiddenCount = useHiddenCount(
    store,
    NOTE_ENTITY_TYPE.project,
    noteIds,
    filter,
  );
  const personsV =
    useTableVersion(store, TABLES.persons) + useTableVersion(store, TABLES.person_links);
  const visible = useMemo(() => {
    void personsV; // invalidation token: person_links/persons edits re-run the peopleForEntity filter
    if (filter.length === 0) return noteIds;
    const set = new Set(filter);
    return noteIds.filter((nid) => {
      for (const id of peopleForEntity(
        store,
        NOTE_ENTITY_TYPE.project,
        nid,
      )) {
        if (set.has(id)) return true;
      }
      return false;
    });
  }, [store, noteIds, filter, personsV]);

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
        <PersonFilterBanner />
        <section className="notes-tab" aria-label="Notes">
          <ul className="notes-tab-list" role="list">
            {visible.map((nid) => (
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
          {hiddenCount > 0 && (
            <p className="hidden-stub">
              {hiddenCount} {hiddenCount === 1 ? 'note' : 'notes'} hidden
            </p>
          )}
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

function AreaTasksSection({ areaId, showCompleted }: { areaId: string; showCompleted: boolean }): React.JSX.Element {
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
  const orderedIds = sortTaskIds(store, allIds);
  const visibleIds = useMemo(
    () =>
      showCompleted
        ? orderedIds
        : orderedIds.filter(
            (tid) => getEffectiveTaskStatus(store, tid) !== TASK_STATUS.done,
          ),
    [showCompleted, orderedIds, store],
  );
  if (visibleIds.length === 0) return <></>;
  const visibleTopLevel = showCompleted
    ? topLevelIds.length
    : topLevelIds.filter(
        (tid) => getEffectiveTaskStatus(store, tid) !== TASK_STATUS.done,
      ).length;
  return (
    <Group title="Area tasks" count={visibleTopLevel}>
      <TaskList ids={visibleIds} readOnly effectiveStatus />
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
