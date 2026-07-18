import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRowIds } from 'tinybase/ui-react';
import {
  useDataLayer,
  useStoreVersion,
  useArea,
  useAreaCounts,
  useNote,
  useTask,
  useProject,
  useTasksForProjectDeep,
  useProjectRollups,
  useNotesForAreaTree,
  useNoteIdsForEntity,
  createProject,
  createTask,
  createNote,
  createArea,
  getArea,
  updateTask,
  setTaskStatus,
  deleteTask,
  deleteProject,
  deleteNote,
  reorderProject,
  reorderTask,
  TABLES,
  TASK_STATUS,
  NOTE_ENTITY_TYPE,
  COLUMNS,
  getPlacement,
  useInboxTaskIds,
  useAreaTaskIds,
  useEffectiveTaskStatus,
  useEffectiveCast,
  useHiddenCount,
  effectiveSetForEntity,
  getEntityPersonIds,
  usePerson,
} from '../data/index.ts';
import type { Area, NoteEntityType } from '../data/index.ts';
import type { MergeableStore } from 'tinybase';
import { useSelection } from './useSelection.ts';
import ConfirmModal from './ConfirmModal.tsx';
import InlineAddInput from './InlineAddInput.tsx';
import { areaColorHex } from '../data/colors.ts';
import type { AreaColorId } from '../data/colors.ts';
import { renderMarkdown } from '../markdown/render.ts';
import { SortableList } from './SortableList.tsx';
import type { SortableHandleProps } from './SortableList.tsx';
import PersonFilterBanner from './persons/PersonFilterBanner.tsx';
import PersonAssignmentButton from './persons/PersonAssignmentButton.tsx';
import PersonAssignmentPopover from './persons/PersonAssignmentPopover.tsx';
import PersonAvatar from './persons/PersonAvatar.tsx';
import { usePersonFilter } from './persons/usePersonFilter.ts';

type Tab = 'projects' | 'tasks' | 'notes';
type ProjectTab = 'tasks' | 'notes';
const TABS: { id: Tab; label: string }[] = [
  { id: 'projects', label: 'Projects' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'notes', label: 'Notes' },
];

const PROJECT_TABS: { id: ProjectTab; label: string }[] = [
  { id: 'tasks', label: 'Tasks' },
  { id: 'notes', label: 'Notes' },
];

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

  const parentChain = useMemo<readonly Area[]>(() => {
    if (!areaId) return [];
    void areaRowIds.length;
    return buildParentChain(store, areaId);
  }, [store, areaId, areaRowIds]);

  if (selection.kind === 'project') {
    return <ProjectPane projectId={selection.id} />;
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
            <p>Pick an area from the sidebar to get started, or create a new one.</p>
          </div>
        </div>
      </main>
    );
  }

  const projectCount = counts.find((c) => c.id === areaId)?.projectCount ?? 0;
  const taskCount = counts.find((c) => c.id === areaId)?.taskCount ?? 0;
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
        />
        <PersonFilterBanner />
        <PaneTabs
          tabs={TABS}
          tab={tab}
          onChange={setTab}
          counts={{ projects: projectCount, tasks: taskCount, notes: noteCount }}
        />
        {tab === 'projects' && (
          <ProjectsTab areaId={areaId} isActive />
        )}
        {tab === 'tasks' && (
          <TasksTab areaId={areaId} isActive />
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
}: {
  areaId: string;
  name: string;
  color: AreaColorId;
  parentChain: readonly Area[];
  showAddSubArea: boolean;
  onNavigate: (id: string) => void;
  onCreateSubArea: ((name: string) => void) | null;
}): React.JSX.Element {
  const { store } = useDataLayer();
  useStoreVersion(store);
  const hex = areaColorHex(color);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const cast = useEffectiveCast(store, areaId);

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
      <h1 className="area-header-name">{name || 'Untitled'}</h1>
      <AreaHeaderCast areaId={areaId} cast={cast} />
      {showAddSubArea && onCreateSubArea && (
        adding ? (
          <input
            type="text"
            className="area-header-add-input"
            placeholder="Sub-area name…"
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
  useStoreVersion(store);
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
        current={getEntityPersonIds(store, NOTE_ENTITY_TYPE.area, areaId)}
        cast={[...cast]}
        title="Cast"
        onClose={() => setAnchor(null)}
      />
    </>
  );
}


function CastChip({
  personId,
  store,
  onEdit,
}: {
  personId: string;
  store: MergeableStore;
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
}

function PaneTabs<T extends string>({
  tabs,
  tab,
  onChange,
  counts,
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
      <button type="button" className="area-tab-action" aria-label="Search" title="Search">
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#search-icon" />
        </svg>
      </button>
      <button type="button" className="area-tab-action" aria-label="Sort" title="Sort">
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#sort-icon" />
        </svg>
      </button>
    </div>
  );
}

function ProjectsTab({
  areaId,
  isActive,
}: {
  areaId: string;
  isActive: boolean;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const rollups = useProjectRollups(store);
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

  function addProject(name: string): void {
    createProject(store, { name, areaId });
  }

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
  const visible = useMemo(() => {
    if (filter.length === 0) return inArea;
    const set = new Set(filter);
    return inArea.filter((p) => {
      for (const id of effectiveSetForEntity(store, NOTE_ENTITY_TYPE.project, p.projectId)) {
        if (set.has(id)) return true;
      }
      return false;
    });
  }, [store, inArea, filter]);

  const done = visible.filter((p) => p.total > 0 && p.done === p.total);
  const active = visible.filter((p) => p.total === 0 || p.done < p.total);
  const addInputRef = useRef<HTMLInputElement>(null);
  const wasEmpty = useRef(inArea.length === 0);
  useEffect(() => {
    if (!isActive) return;
    const empty = inArea.length === 0;
    if (empty || wasEmpty.current) addInputRef.current?.focus();
    wasEmpty.current = empty;
  }, [isActive, inArea.length]);

  return (
    <section className="projects-tab" aria-label="Projects">
      {active.length > 0 && (
        <Group title="ACTIVE" count={active.length}>
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
                />
              );
            }}
          </SortableList>
        </Group>
      )}
      {done.length > 0 && (
        <Group title="DONE" count={done.length}>
          {done.map((p) => (
            <ProjectRow
              key={p.projectId}
              projectId={p.projectId}
              name={p.projectName}
              done={p.done}
              total={p.total}
              doneGroup
            />
          ))}
        </Group>
      )}
      <InlineAddInput
        ref={addInputRef}
        placeholder={
          inArea.length === 0
            ? 'No projects yet — name this one to start.'
            : 'New project…'
        }
        ariaLabel="New project"
        onSubmit={addProject}
      />
      {hiddenCount > 0 && (
        <p className="hidden-stub">
          {hiddenCount} {hiddenCount === 1 ? 'project' : 'projects'} hidden
        </p>
      )}
    </section>
  );
}

function Group({
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

function ProjectRow({
  projectId,
  name,
  done,
  total,
  doneGroup,
}: {
  projectId: string;
  name: string;
  done: number;
  total: number;
  doneGroup?: boolean;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const project = useProject(store, projectId);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const display = (project?.name ?? '') || name || 'Untitled';

  return (
    <li className={`project-row${doneGroup ? ' project-row-done' : ''}`}>
      <div className="project-row-line">
        <button
          type="button"
          className="project-row-name"
          title="Open project"
          onClick={() => navigate({ kind: 'project', id: projectId })}
        >
          {editing ? (
            <input
              type="text"
              className="project-row-name-input"
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
            display
          )}
        </button>
        <div className="project-row-progress" aria-label={`${done} of ${total} tasks done`}>
          <div
            className={`project-row-progress-bar${
              doneGroup ? ' project-row-progress-done' : ''
            }`}
          >
            <div className="project-row-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="project-row-progress-count">
            {done} / {total}
          </span>
        </div>
        <PersonAssignmentButton
          entityType={NOTE_ENTITY_TYPE.project}
          entityId={projectId}
        />
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
      <ConfirmModal
        open={confirmDelete}
        title="Delete project?"
        message={`"${display}" will be deleted. Tasks and notes attached to it will become orphans.`}
        confirmLabel="Delete"
        onConfirm={() => {
          deleteProject(store, projectId);
          setConfirmDelete(false);
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
}: {
  handle: SortableHandleProps;
  projectId: string;
  name: string;
  done: number;
  total: number;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const project = useProject(store, projectId);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { navigate } = useSelection();

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
          {...(handle.listeners ?? {})}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#drag-icon" />
          </svg>
        </button>
        <button
          type="button"
          className="project-row-name"
          title="Open project"
          onClick={() => navigate({ kind: 'project', id: projectId })}
        >
          {editing ? (
            <input
              type="text"
              className="project-row-name-input"
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
            display
          )}
        </button>
        <div className="project-row-progress" aria-label={`${done} of ${total} tasks done`}>
          <div className="project-row-progress-bar">
            <div className="project-row-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="project-row-progress-count">
            {done} / {total}
          </span>
        </div>
        <PersonAssignmentButton
          entityType={NOTE_ENTITY_TYPE.project}
          entityId={projectId}
        />
        <button
          type="button"
          className="project-row-action"
          aria-label="Rename project"
          title="Rename"
          onClick={(e) => {
            e.stopPropagation();
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
      <ConfirmModal
        open={confirmDelete}
        title="Delete project?"
        message={`"${display}" will be deleted. Tasks and notes attached to it will become orphans.`}
        confirmLabel="Delete"
        onConfirm={() => {
          deleteProject(store, projectId);
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </li>
  );
}

interface TasksTabProject {
  id: string;
  name: string;
  order: number;
}

function TasksTab({
  areaId,
  isActive,
}: {
  areaId: string;
  isActive: boolean;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const rollups = useProjectRollups(store);
  const projects: TasksTabProject[] = useMemo(
    () =>
      rollups
        .filter((r) => r.areaId === areaId)
        .map((r) => ({ id: r.projectId, name: r.projectName, order: r.order }))
        .sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          return a.name.localeCompare(b.name);
        }),
    [rollups, areaId],
  );

  const [targetProjectId, setTargetProjectId] = useState<string | null>(null);

  function addTask(title: string): void {
    if (projects.length === 0) {
      const newId = createProject(store, { name: 'General', areaId });
      createTask(store, { title, placement: { kind: 'project', id: newId } });
    } else {
      const pid = targetProjectId ?? projects[0]!.id;
      createTask(store, { title, placement: { kind: 'project', id: pid } });
    }
  }

  const addInputRef = useRef<HTMLInputElement>(null);
  const wasEmpty = useRef(projects.length === 0);
  useEffect(() => {
    if (!isActive) return;
    const empty = projects.length === 0;
    if (empty || wasEmpty.current) addInputRef.current?.focus();
    wasEmpty.current = empty;
  }, [isActive, projects.length]);

  return (
    <section className="tasks-tab" aria-label="Tasks">
      <AreaTasksSection areaId={areaId} />
      {projects.length > 1 && (
        <div className="tasks-tab-target">
          <label className="field-label-inline">Add new tasks to</label>
          <select
            value={targetProjectId ?? projects[0]!.id}
            onChange={(e) => setTargetProjectId(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || 'Untitled'}
              </option>
            ))}
          </select>
        </div>
      )}
      {projects.map((p) => (
        <ProjectTasksGroup key={p.id} projectId={p.id} projectName={p.name} />
      ))}
      <InlineAddInput
        ref={addInputRef}
        placeholder={
          projects.length === 0
            ? 'No projects yet — name a task to spin one up.'
            : 'New task…'
        }
        ariaLabel="New task"
        onSubmit={addTask}
      />
    </section>
  );
}

function ProjectTasksGroup({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  useStoreVersion(store);
  const taskIds = useTasksForProjectDeep(store, projectId);
  const { selected: filter } = usePersonFilter();
  const orderedIds = [...taskIds].sort((a, b) => {
    const oa = Number(store.getCell(TABLES.tasks, a, COLUMNS.tasks.order) ?? 0);
    const ob = Number(store.getCell(TABLES.tasks, b, COLUMNS.tasks.order) ?? 0);
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b);
  });
  const visibleIds = useMemo(() => {
    if (filter.length === 0) return orderedIds;
    const set = new Set(filter);
    return orderedIds.filter((tid) => {
      for (const id of effectiveSetForEntity(store, NOTE_ENTITY_TYPE.task, tid)) {
        if (set.has(id)) return true;
      }
      return false;
    });
  }, [store, orderedIds, filter]);
  const open: string[] = [];
  const done: string[] = [];
  for (const tid of visibleIds) {
    if (isTaskDone(store, tid)) done.push(tid);
    else open.push(tid);
  }
  const hiddenCount = useHiddenCount(
    store,
    NOTE_ENTITY_TYPE.task,
    taskIds,
    filter,
  );

  function onReorder(activeId: string, beforeId: string | undefined): void {
    reorderTask(store, activeId, beforeId);
  }

  return (
    <>
      <ProjectHeader name={projectName} count={visibleIds.length} />
      {open.length > 0 && (
        <SortableList
          itemIds={open}
          onReorder={onReorder}
          ariaLabel={`Open tasks for ${projectName}`}
          className="sortable-list"
        >
          {(tid, handle) => (
            <SortableTaskLineRow
              handle={handle}
              taskId={tid}
              projectName={projectName}
            />
          )}
        </SortableList>
      )}
      {done.length > 0 && (
        <Group title="DONE" count={done.length}>
          {done.map((tid) => (
            <TaskLineRow key={tid} taskId={tid} projectName={projectName} doneGroup />
          ))}
        </Group>
      )}
      {hiddenCount > 0 && (
        <p className="hidden-stub">
          {hiddenCount} {hiddenCount === 1 ? 'task' : 'tasks'} hidden
        </p>
      )}
    </>
  );
}

function ProjectHeader({
  name,
  count,
}: {
  name: string;
  count: number;
}): React.JSX.Element {
  return (
    <header className="project-header">
      <span className="project-header-name">{name || 'Untitled'}</span>
      <span className="project-header-count">· {count}</span>
    </header>
  );
}

function isTaskDone(store: MergeableStore, taskId: string): boolean {
  if (!store.hasRow(TABLES.tasks, taskId)) return false;
  return store.getCell(TABLES.tasks, taskId, COLUMNS.tasks.status) === TASK_STATUS.done;
}

function TaskLineRow({
  taskId,
  projectName,
  doneGroup,
}: {
  taskId: string;
  projectName: string;
  doneGroup?: boolean;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const task = useTask(store, taskId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!task) return <></>;
  const done = task.status === TASK_STATUS.done;
  return (
    <li className={`task-line${doneGroup || done ? ' task-line-done' : ''}`}>
      <input
        type="checkbox"
        className="task-line-check"
        checked={done}
        onChange={() =>
          setTaskStatus(store, taskId, done ? TASK_STATUS.open : TASK_STATUS.done)
        }
        aria-label={done ? 'Mark not done' : 'Mark done'}
      />
      <input
        className="task-line-title"
        value={task.title}
        onChange={(e) => updateTask(store, taskId, { title: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        aria-label="Task title"
      />
      <PersonAssignmentButton
        entityType={NOTE_ENTITY_TYPE.task}
        entityId={taskId}
      />
      <span className="task-line-project">{projectName || 'Untitled'}</span>
      <button
        type="button"
        className="task-line-action task-line-action-danger"
        aria-label="Delete task"
        title="Delete"
        onClick={() => setConfirmDelete(true)}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#trash-icon" />
        </svg>
      </button>
      <ConfirmModal
        open={confirmDelete}
        title="Delete task?"
        message={`"${task.title || 'Untitled'}" will be deleted.`}
        confirmLabel="Delete"
        onConfirm={() => {
          deleteTask(store, taskId);
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </li>
  );
}

function SortableTaskLineRow({
  handle,
  taskId,
  projectName,
}: {
  handle: SortableHandleProps;
  taskId: string;
  projectName: string;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const task = useTask(store, taskId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!task) return <></>;
  const done = task.status === TASK_STATUS.done;
  const classes = ['task-line', 'sortable-row'];
  if (done) classes.push('task-line-done');
  if (handle.isDragging) classes.push('sortable-row-active');
  if (handle.isOver) classes.push('sortable-row-over');

  return (
    <li
      ref={handle.ref}
      style={handle.style}
      className={classes.join(' ')}
      data-drag-over={handle.isOver ? 'true' : undefined}
    >
      <button
        type="button"
        className="task-line-drag-handle"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        onClick={(e) => e.preventDefault()}
        {...(handle.listeners ?? {})}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#drag-icon" />
        </svg>
      </button>
      <input
        type="checkbox"
        className="task-line-check"
        checked={done}
        onChange={() =>
          setTaskStatus(store, taskId, done ? TASK_STATUS.open : TASK_STATUS.done)
        }
        aria-label={done ? 'Mark not done' : 'Mark done'}
      />
      <input
        className="task-line-title"
        value={task.title}
        onChange={(e) => updateTask(store, taskId, { title: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        aria-label="Task title"
      />
      <PersonAssignmentButton
        entityType={NOTE_ENTITY_TYPE.task}
        entityId={taskId}
      />
      <span className="task-line-project">{projectName || 'Untitled'}</span>
      <button
        type="button"
        className="task-line-action task-line-action-danger"
        aria-label="Delete task"
        title="Delete"
        onClick={() => setConfirmDelete(true)}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#trash-icon" />
        </svg>
      </button>
      <ConfirmModal
        open={confirmDelete}
        title="Delete task?"
        message={`"${task.title || 'Untitled'}" will be deleted.`}
        confirmLabel="Delete"
        onConfirm={() => {
          deleteTask(store, taskId);
          setConfirmDelete(false);
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
  const visible = useMemo(() => {
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
      for (const id of effectiveSetForEntity(
        store,
        noteEntityType as NoteEntityType,
        noteEntityId,
      )) {
        if (set.has(id)) return true;
      }
      return false;
    });
  }, [store, allIds, filter]);


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
    <section className="notes-tab" aria-label="Notes">
      <ul className="notes-tab-list" role="list">
        {visible.map((nid) => (
          <NoteLine key={nid} noteId={nid} />
        ))}
      </ul>
      <InlineAddInput
        ref={addInputRef}
        placeholder={
          allIds.length === 0
            ? 'No notes yet — start one here.'
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
        <div
          className="markdown-body note-line-rendered"
          role="button"
          tabIndex={0}
          onClick={() => {
            setDraft(body);
            setEditing(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDraft(body);
              setEditing(true);
            }
          }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
        />
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
          Click to write a note.
        </button>
      )}
      {editing && (
        <textarea
          className="note-line-body"
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

function ProjectPane({ projectId }: { projectId: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const project = useProject(store, projectId);
  const taskIds = useTasksForProjectDeep(store, projectId);
  const noteIds = useNoteIdsForEntity(store, NOTE_ENTITY_TYPE.project, projectId);
  const [tabByProject, setTabByProject] = useState<Record<string, ProjectTab>>({});
  const tab: ProjectTab = tabByProject[projectId] ?? 'tasks';
  const setTab = (next: ProjectTab): void => {
    setTabByProject((prev) => ({ ...prev, [projectId]: next }));
  };

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
        <ProjectPaneHeader areaId={project.areaId} name={projectName} />
        <PaneTabs
          tabs={PROJECT_TABS}
          tab={tab}
          onChange={setTab}
          counts={{ tasks: taskIds.length, notes: noteIds.length }}
        />
        {tab === 'tasks' && (
          <ProjectTasksTab
            projectId={projectId}
            projectName={projectName}
            isActive
          />
        )}
        {tab === 'notes' && (
          <ProjectNotesTab
            projectId={projectId}
            isActive
          />
        )}
      </div>
    </main>
  );
}

function ProjectPaneHeader({
  areaId,
  name,
}: {
  areaId: string | null;
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
    </div>
  );
}

function ProjectTasksTab({
  projectId,
  projectName,
  isActive,
}: {
  projectId: string;
  projectName: string;
  isActive: boolean;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const [taskIds, setTaskIds] = useState<string[]>(() => {
    const ids: string[] = [];
    collectTaskIds(store, projectId, ids);
    return ids;
  });
  useEffect(() => {
    const refresh = (): void => {
      const ids: string[] = [];
      collectTaskIds(store, projectId, ids);
      setTaskIds(ids);
    };
    refresh();
    const listenerId = store.addDidFinishTransactionListener(refresh);
    return () => {
      store.delListener(listenerId);
    };
  }, [store, projectId]);
  const { selected: filter } = usePersonFilter();
  const hiddenCount = useHiddenCount(store, NOTE_ENTITY_TYPE.task, taskIds, filter);
  const orderedIds = useMemo(
    () =>
      [...taskIds].sort((a, b) => {
        const oa = Number(store.getCell(TABLES.tasks, a, COLUMNS.tasks.order) ?? 0);
        const ob = Number(store.getCell(TABLES.tasks, b, COLUMNS.tasks.order) ?? 0);
        if (oa !== ob) return oa - ob;
        return a.localeCompare(b);
      }),
    [store, taskIds],
  );
  const visibleIds = useMemo(() => {
    if (filter.length === 0) return orderedIds;
    const set = new Set(filter);
    return orderedIds.filter((tid) => {
      for (const id of effectiveSetForEntity(store, NOTE_ENTITY_TYPE.task, tid)) {
        if (set.has(id)) return true;
      }
      return false;
    });
  }, [store, orderedIds, filter]);
  const open: string[] = [];
  const done: string[] = [];
  for (const tid of visibleIds) {
    if (isTaskDone(store, tid)) done.push(tid);
    else open.push(tid);
  }

  function addTask(title: string): void {
    createTask(store, { title, placement: { kind: 'project', id: projectId } });
  }

  function onReorder(activeId: string, beforeId: string | undefined): void {
    reorderTask(store, activeId, beforeId);
  }

  const addInputRef = useRef<HTMLInputElement>(null);
  const wasEmpty = useRef(taskIds.length === 0);
  useEffect(() => {
    if (!isActive) return;
    const empty = taskIds.length === 0;
    if (empty || wasEmpty.current) addInputRef.current?.focus();
    wasEmpty.current = empty;
  }, [isActive, taskIds.length]);

  return (
    <section className="tasks-tab" aria-label="Tasks">
      {open.length > 0 && (
        <SortableList
          itemIds={open}
          onReorder={onReorder}
          ariaLabel="Open tasks"
          className="sortable-list"
        >
          {(tid, handle) => (
            <SortableTaskLineRow
              handle={handle}
              taskId={tid}
              projectName={projectName}
            />
          )}
        </SortableList>
      )}
      {done.length > 0 && (
        <Group title="DONE" count={done.length}>
          {done.map((tid) => (
            <TaskLineRow key={tid} taskId={tid} projectName={projectName} doneGroup />
          ))}
        </Group>
      )}
      <InlineAddInput
        ref={addInputRef}
        placeholder={
          taskIds.length === 0
            ? 'No tasks yet — add the first one.'
            : 'New task…'
        }
        ariaLabel="New task"
        onSubmit={addTask}
      />
      {hiddenCount > 0 && (
        <p className="hidden-stub">
          {hiddenCount} {hiddenCount === 1 ? 'task' : 'tasks'} hidden
        </p>
      )}
    </section>
  );
}

function ProjectNotesTab({
  projectId,
  isActive,
}: {
  projectId: string;
  isActive: boolean;
}): React.JSX.Element {
  const { store } = useDataLayer();
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
  const visible = useMemo(() => {
    if (filter.length === 0) return noteIds;
    const set = new Set(filter);
    return noteIds.filter((nid) => {
      for (const id of effectiveSetForEntity(
        store,
        NOTE_ENTITY_TYPE.project,
        nid,
      )) {
        if (set.has(id)) return true;
      }
      return false;
    });
  }, [store, noteIds, filter]);

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
    if (!isActive) return;
    const empty = noteIds.length === 0;
    if (empty || wasEmpty.current) addInputRef.current?.focus();
    wasEmpty.current = empty;
  }, [isActive, noteIds.length]);

  return (
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
            ? 'No notes yet — start one here.'
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

function InboxPane(): React.JSX.Element {
  const { store } = useDataLayer();
  // Subscribe so newly-created tasks re-render the list.
  useRowIds(TABLES.tasks, store);
  useStoreVersion(store);
  const topLevelIds = useInboxTaskIds(store);
  const allIds = useMemo(() => {
    const out: string[] = [];
    for (const t of topLevelIds) {
      out.push(t);
      collectChildIds(store, t, out);
    }
    return out;
  }, [topLevelIds, store]);
  function addTask(title: string): void {
    createTask(store, { title });
  }
  const orderedIds = sortTaskIds(store, allIds);
  const addInputRef = useRef<HTMLInputElement>(null);
  const wasEmpty = useRef(orderedIds.length === 0);
  useEffect(() => {
    const empty = orderedIds.length === 0;
    if (empty || wasEmpty.current) addInputRef.current?.focus();
    wasEmpty.current = empty;
  }, [orderedIds.length]);
  return (
    <main className="main" aria-label="Inbox">
      <div className="main-body">
        <header className="main-pane-header">
          <h2 className="main-pane-title">Inbox</h2>
        </header>
        <TaskList filteredIds={orderedIds} />
        <InlineAddInput
          ref={addInputRef}
          placeholder={
            orderedIds.length === 0
              ? 'No inbox tasks — capture one here.'
              : 'New inbox task…'
          }
          ariaLabel="New inbox task"
          onSubmit={addTask}
        />
      </div>
    </main>
  );
}

function AreaTasksSection({ areaId }: { areaId: string }): React.JSX.Element {
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
  if (orderedIds.length === 0) return <></>;
  return (
    <Group title="Area tasks" count={topLevelIds.length}>
      <TaskList filteredIds={orderedIds} />
    </Group>
  );
}
function TaskList({
  filteredIds,
}: {
  filteredIds: readonly string[];
}): React.JSX.Element {
  return (
    <ul className="task-list">
      {filteredIds.map((tid) => (
        <TaskListItem key={tid} taskId={tid} />
      ))}
    </ul>
  );
}

function TaskListItem({ taskId }: { taskId: string }): React.JSX.Element | null {
  const { store } = useDataLayer();
  const task = useTask(store, taskId);
  const effective = useEffectiveTaskStatus(store, taskId);
  if (!task || !effective) return null;
  return (
    <li className={`task-line${effective === 'done' ? ' task-line-done' : ''}`}>
      <input
        type="checkbox"
 checked={effective === 'done'}
        onChange={() =>
          setTaskStatus(store, taskId, effective === 'done' ? 'open' : 'done')
        }
        aria-label={effective === 'done' ? 'Mark not done' : 'Mark done'}
      />
      <span className="task-line-title">{task.title}</span>
    </li>
  );
}

function sortTaskIds(store: MergeableStore, ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    const oa = Number(store.getCell(TABLES.tasks, a, COLUMNS.tasks.order) ?? 0);
    const ob = Number(store.getCell(TABLES.tasks, b, COLUMNS.tasks.order) ?? 0);
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b);
  });
}


function stripPreview(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '';
  const first = trimmed.split('\n', 1)[0] ?? '';
  return first.length > 140 ? `${first.slice(0, 140)}…` : first;
}

function collectTaskIds(
  store: MergeableStore,
  projectId: string,
  out: string[],
): void {
  for (const id of store.getRowIds(TABLES.tasks)) {
    const p = getPlacement(store, id);
    if (p.kind !== 'project' || p.id !== projectId) continue;
    out.push(id);
  }
  // Walk nested children from every top-level task — not just the first —
  // so sub-tasks of any sibling are included.
  const tops = [...out];
  for (const tid of tops) collectChildIds(store, tid, out);
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
