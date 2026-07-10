import { useEffect, useMemo, useState } from 'react';
import {
  useDataLayer,
  useStoreVersion,
  useDomain,
  useDomainCounts,
  useNote,
  useTask,
  useProject,
  useTasksForProjectDeep,
  useProjectRollups,
  useNotesForDomainTree,
  useNoteIdsForEntity,
  createProject,
  createTask,
  createNote,
  updateTask,
  setTaskStatus,
  deleteTask,
  deleteProject,
  deleteNote,
  TABLES,
  TASK_STATUS,
  NOTE_ENTITY_TYPE,
  COLUMNS,
} from '../data/index.ts';
import type { MergeableStore } from 'tinybase';
import { useSelection } from './useSelection.ts';
import ConfirmModal from './ConfirmModal.tsx';
import PromptModal from './PromptModal.tsx';
import { domainColorHex } from '../data/colors.ts';
import type { DomainColorId } from '../data/colors.ts';
import { renderMarkdown } from '../markdown/render.ts';
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
  const { selection } = useSelection();
  useStoreVersion(store);
  const counts = useDomainCounts(store);

  const domainId = selection.kind === 'domain' ? selection.id : null;
  const domain = useDomain(store, domainId ?? undefined);

  // Per-domain tab state so each domain remembers which tab is open.
  const [tabByDomain, setTabByDomain] = useState<Record<string, Tab>>({});
  const tab: Tab = (domainId ? tabByDomain[domainId] : undefined) ?? 'projects';
  const [addPromptOpen, setAddPromptOpen] = useState(false);
  const setTab = (next: Tab): void => {
    if (!domainId) return;
    setAddPromptOpen(false);
    setTabByDomain((prev) => ({ ...prev, [domainId]: next }));
  };

  // Project selection → dedicated project pane (Tasks / Notes only).
  if (selection.kind === 'project') {
    return <ProjectPane projectId={selection.id} />;
  }

  if (!domainId || !domain) {
    return (
      <main className="main" aria-label="Editor">
        <div className="main-body">
          <div className="main-empty">
            <h2>Welcome to LocalAction</h2>
            <p>Pick a domain from the sidebar to get started, or create a new one.</p>
          </div>
        </div>
      </main>
    );
  }

  const projectCount = counts.find((c) => c.id === domainId)?.projectCount ?? 0;
  const taskCount = counts.find((c) => c.id === domainId)?.taskCount ?? 0;
  const noteCount = counts.find((c) => c.id === domainId)?.noteCount ?? 0;

  return (
    <main className="main" aria-label="Editor">
      <div className="main-body">
        <DomainHeader name={domain.name} color={domain.color} />
        <PaneTabs
          tabs={TABS}
          tab={tab}
          onChange={setTab}
          counts={{ projects: projectCount, tasks: taskCount, notes: noteCount }}
          onAdd={() => setAddPromptOpen(true)}
          addLabel={tab === 'projects' ? 'New project' : tab === 'tasks' ? 'New task' : 'New note'}
        />
        {tab === 'projects' && (
          <ProjectsTab domainId={domainId} addPromptOpen={addPromptOpen} setAddPromptOpen={setAddPromptOpen} />
        )}
        {tab === 'tasks' && (
          <TasksTab domainId={domainId} addPromptOpen={addPromptOpen} setAddPromptOpen={setAddPromptOpen} />
        )}
        {tab === 'notes' && (
          <NotesTab domainId={domainId} addPromptOpen={addPromptOpen} setAddPromptOpen={setAddPromptOpen} />
        )}
      </div>
    </main>
  );
}

function DomainHeader({
  name,
  color,
}: {
  name: string;
  color: DomainColorId;
}): React.JSX.Element {
  const hex = domainColorHex(color);
  return (
    <div className="domain-header">
      <span className="domain-header-slash" aria-hidden="true" style={{ color: hex }}>
        /
      </span>
      <h1 className="domain-header-name">{name || 'Untitled'}</h1>
    </div>
  );
}

interface PaneTabsProps<T extends string> {
  tabs: readonly { id: T; label: string }[];
  tab: T;
  onChange: (tab: T) => void;
  counts: Record<T, number>;
  onAdd: () => void;
  addLabel: string;
}

function PaneTabs<T extends string>({
  tabs,
  tab,
  onChange,
  counts,
  onAdd,
  addLabel,
}: PaneTabsProps<T>): React.JSX.Element {
  return (
    <div className="domain-tabs" role="tablist">
      {tabs.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`domain-tab${active ? ' domain-tab-active' : ''}`}
            onClick={() => onChange(t.id)}
          >
            <span className="domain-tab-label">{t.label}</span>
            <span className="domain-tab-count">{counts[t.id]}</span>
          </button>
        );
      })}
      <div className="domain-tabs-spacer" />
      <button type="button" className="domain-tab-action" aria-label="Search" title="Search">
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#search-icon" />
        </svg>
      </button>
      <button type="button" className="domain-tab-action" aria-label="Sort" title="Sort">
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#sort-icon" />
        </svg>
      </button>
      <button
        type="button"
        className="domain-tab-action domain-tab-add"
        onClick={onAdd}
        aria-label={addLabel}
        title={addLabel}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#add-icon" />
        </svg>
      </button>
    </div>
  );
}

/* -------------------------------------------------------------- Projects */

function ProjectsTab({
  domainId,
  addPromptOpen,
  setAddPromptOpen,
}: {
  domainId: string;
  addPromptOpen: boolean;
  setAddPromptOpen: (open: boolean) => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const rollups = useProjectRollups(store);
  const inDomain = useMemo(
    () =>
      rollups
        .filter((r) => r.domainId === domainId)
        .sort((a, b) => a.projectName.localeCompare(b.projectName)),
    [rollups, domainId],
  );

  function addProject(name: string): void {
    createProject(store, { name, domainId });
    setAddPromptOpen(false);
  }

  // A project is "done" only when it has tasks and all are complete;
  // everything else (including taskless projects) is active so the list
  // never silently hides projects the badge already counts.
  const done = inDomain.filter((p) => p.total > 0 && p.done === p.total);
  const active = inDomain.filter((p) => p.total === 0 || p.done < p.total);

  return (
    <section className="projects-tab" aria-label="Projects">
      {inDomain.length === 0 ? (
        <EmptyTab message="No projects yet." onAdd={() => setAddPromptOpen(true)} addLabel="+ Project" />
      ) : (
        <>
          {active.length > 0 && (
            <Group title="ACTIVE" count={active.length}>
              {active.map((p) => (
                <ProjectRow
                  key={p.projectId}
                  projectId={p.projectId}
                  name={p.projectName}
                  done={p.done}
                  total={p.total}
                />
              ))}
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
        </>
      )}
      <PromptModal
        open={addPromptOpen}
        title="New project"
        label="Name"
        placeholder="e.g. Q3 roadmap"
        submitLabel="Create"
        onSubmit={addProject}
        onCancel={() => setAddPromptOpen(false)}
      />
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

/* ----------------------------------------------------------------- Tasks */

interface TasksTabProject {
  id: string;
  name: string;
}

function TasksTab({
  domainId,
  addPromptOpen,
  setAddPromptOpen,
}: {
  domainId: string;
  addPromptOpen: boolean;
  setAddPromptOpen: (open: boolean) => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const rollups = useProjectRollups(store);
  const projects: TasksTabProject[] = useMemo(
    () =>
      rollups
        .filter((r) => r.domainId === domainId)
        .map((r) => ({ id: r.projectId, name: r.projectName }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rollups, domainId],
  );

  const [targetProjectId, setTargetProjectId] = useState<string | null>(null);

  function addTask(title: string): void {
    if (projects.length === 0) {
      const newId = createProject(store, { name: 'General', domainId });
      createTask(store, { title, projectId: newId });
    } else {
      const pid = targetProjectId ?? projects[0]!.id;
      createTask(store, { title, projectId: pid });
    }
    setAddPromptOpen(false);
  }

  return (
    <section className="tasks-tab" aria-label="Tasks">
      {projects.length === 0 ? (
        <EmptyTab message="No tasks yet." onAdd={() => setAddPromptOpen(true)} addLabel="+ Task" />
      ) : (
        <>
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
        </>
      )}
      <PromptModal
        open={addPromptOpen}
        title="New task"
        label="Title"
        placeholder="e.g. Set up weekly sync"
        submitLabel="Create"
        onSubmit={addTask}
        onCancel={() => setAddPromptOpen(false)}
      />
    </section>
  );
}

/**
 * A single project's task list, grouped into ACTIVE / DONE rows. Lives
 * in its own component so `useTasksForProjectDeep` is called a fixed
 * number of times regardless of how many projects the user has.
 */
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
  if (taskIds.length === 0) return null;
  // Partition into open / done using a non-reactive helper; the
  // TaskLineRow's own `useTask` re-render keeps the visual state in sync.
  const open: string[] = [];
  const done: string[] = [];
  for (const tid of taskIds) {
    if (isTaskDone(store, tid)) done.push(tid);
    else open.push(tid);
  }
  if (open.length === 0 && done.length === 0) return null;
  return (
    <>
      <ProjectHeader name={projectName} count={taskIds.length} />
      {open.map((tid) => (
        <TaskLineRow key={tid} taskId={tid} projectName={projectName} />
      ))}
      {done.length > 0 && (
        <Group title="DONE" count={done.length}>
          {done.map((tid) => (
            <TaskLineRow key={tid} taskId={tid} projectName={projectName} doneGroup />
          ))}
        </Group>
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

/* ----------------------------------------------------------------- Notes */

function NotesTab({
  domainId,
  addPromptOpen,
  setAddPromptOpen,
}: {
  domainId: string;
  addPromptOpen: boolean;
  setAddPromptOpen: (open: boolean) => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { domainNotes, projectNotes, taskNotes } = useNotesForDomainTree(
    store,
    domainId,
  );
  const allIds = useMemo(
    () => [...domainNotes, ...projectNotes, ...taskNotes],
    [domainNotes, projectNotes, taskNotes],
  );

  function addNote(title: string): void {
    createNote(store, {
      title,
      body: '',
      entityType: NOTE_ENTITY_TYPE.domain,
      entityId: domainId,
    });
    setAddPromptOpen(false);
  }

  return (
    <section className="notes-tab" aria-label="Notes">
      {allIds.length === 0 ? (
        <EmptyTab message="No notes yet." onAdd={() => setAddPromptOpen(true)} addLabel="+ Note" />
      ) : (
        <ul className="notes-tab-list" role="list">
          {allIds.map((nid) => (
            <NoteLine key={nid} noteId={nid} />
          ))}
        </ul>
      )}
      <PromptModal
        open={addPromptOpen}
        title="New note"
        label="Title"
        placeholder="e.g. Weekly retrospective"
        submitLabel="Create"
        onSubmit={addNote}
        onCancel={() => setAddPromptOpen(false)}
      />
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

/* -------------------------------------------------------- Project pane */

function ProjectPane({ projectId }: { projectId: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const project = useProject(store, projectId);
  const taskIds = useTasksForProjectDeep(store, projectId);
  const noteIds = useNoteIdsForEntity(store, NOTE_ENTITY_TYPE.project, projectId);
  const [tabByProject, setTabByProject] = useState<Record<string, ProjectTab>>({});
  const [addPromptOpen, setAddPromptOpen] = useState(false);
  const tab: ProjectTab = tabByProject[projectId] ?? 'tasks';
  const setTab = (next: ProjectTab): void => {
    setAddPromptOpen(false);
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
        <ProjectPaneHeader domainId={project.domainId} name={projectName} />
        <PaneTabs
          tabs={PROJECT_TABS}
          tab={tab}
          onChange={setTab}
          counts={{ tasks: taskIds.length, notes: noteIds.length }}
          onAdd={() => setAddPromptOpen(true)}
          addLabel={tab === 'tasks' ? 'New task' : 'New note'}
        />
        {tab === 'tasks' && (
          <ProjectTasksTab
            projectId={projectId}
            projectName={projectName}
            addPromptOpen={addPromptOpen}
            setAddPromptOpen={setAddPromptOpen}
          />
        )}
        {tab === 'notes' && (
          <ProjectNotesTab
            projectId={projectId}
            addPromptOpen={addPromptOpen}
            setAddPromptOpen={setAddPromptOpen}
          />
        )}
      </div>
    </main>
  );
}

function ProjectPaneHeader({
  domainId,
  name,
}: {
  domainId: string | null;
  name: string;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const domain = useDomain(store, domainId ?? undefined);
  return (
    <div className="domain-header">
      {domain && (
        <button
          type="button"
          className="domain-header-crumb"
          onClick={() => navigate({ kind: 'domain', id: domain.id })}
        >
          {domain.name || 'Untitled'}
        </button>
      )}
      <span className="domain-header-slash" aria-hidden="true">
        /
      </span>
      <h1 className="domain-header-name">{name}</h1>
    </div>
  );
}

function ProjectTasksTab({
  projectId,
  projectName,
  addPromptOpen,
  setAddPromptOpen,
}: {
  projectId: string;
  projectName: string;
  addPromptOpen: boolean;
  setAddPromptOpen: (open: boolean) => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  // Local listener-driven state. `useTasksForProjectDeep` discards the
  // return of `useRowIds` inside, which React Compiler's optimizer can
  // treat as a non-effecting call — leaving a stale "No tasks yet" body
  // until a tab toggle. Driving `taskIds` from a local subscription
  // pinned to the component lifecycle gives predictable re-renders.
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
  const open: string[] = [];
  const done: string[] = [];
  for (const tid of taskIds) {
    if (isTaskDone(store, tid)) done.push(tid);
    else open.push(tid);
  }

  function addTask(title: string): void {
    createTask(store, { title, projectId });
    setAddPromptOpen(false);
  }

  return (
    <section className="tasks-tab" aria-label="Tasks">
      {taskIds.length === 0 ? (
        <EmptyTab message="No tasks yet." onAdd={() => setAddPromptOpen(true)} addLabel="+ Task" />
      ) : (
        <>
          {open.length > 0 && (
            <Group title="ACTIVE" count={open.length}>
              {open.map((tid) => (
                <TaskLineRow key={tid} taskId={tid} projectName={projectName} />
              ))}
            </Group>
          )}
          {done.length > 0 && (
            <Group title="DONE" count={done.length}>
              {done.map((tid) => (
                <TaskLineRow key={tid} taskId={tid} projectName={projectName} doneGroup />
              ))}
            </Group>
          )}
        </>
      )}
      <PromptModal
        open={addPromptOpen}
        title="New task"
        label="Title"
        placeholder="e.g. Set up weekly sync"
        submitLabel="Create"
        onSubmit={addTask}
        onCancel={() => setAddPromptOpen(false)}
      />
    </section>
  );
}

function ProjectNotesTab({
  projectId,
  addPromptOpen,
  setAddPromptOpen,
}: {
  projectId: string;
  addPromptOpen: boolean;
  setAddPromptOpen: (open: boolean) => void;
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

  function addNote(title: string): void {
    createNote(store, {
      title,
      body: '',
      entityType: NOTE_ENTITY_TYPE.project,
      entityId: projectId,
    });
    setAddPromptOpen(false);
  }

  return (
    <section className="notes-tab" aria-label="Notes">
      {noteIds.length === 0 ? (
        <EmptyTab message="No notes yet." onAdd={() => setAddPromptOpen(true)} addLabel="+ Note" />
      ) : (
        <ul className="notes-tab-list" role="list">
          {noteIds.map((nid) => (
            <NoteLine key={nid} noteId={nid} />
          ))}
        </ul>
      )}
      <PromptModal
        open={addPromptOpen}
        title="New note"
        label="Title"
        placeholder="e.g. Weekly retrospective"
        submitLabel="Create"
        onSubmit={addNote}
        onCancel={() => setAddPromptOpen(false)}
      />
    </section>
  );
}

/* ------------------------------------------------------------- Shared */

function EmptyTab({
  message,
  onAdd,
  addLabel,
}: {
  message: string;
  onAdd: () => void;
  addLabel: string;
}): React.JSX.Element {
  return (
    <div className="empty-tab">
      <p>{message}</p>
      <button type="button" className="btn btn-primary" onClick={onAdd}>
        {addLabel}
      </button>
    </div>
  );
}

function stripPreview(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '';
  const first = trimmed.split('\n', 1)[0] ?? '';
  return first.length > 140 ? `${first.slice(0, 140)}…` : first;
}

/**
 * Recursive top-level + nested task ids for a project, mirroring the
 * shape of `useTasksForProjectDeep` but driven imperatively from a
 * transaction listener in `ProjectTasksTab`.
 */
function collectTaskIds(
  store: MergeableStore,
  projectId: string,
  out: string[],
): void {
  for (const id of store.getRowIds(TABLES.tasks)) {
    if (store.getCell(TABLES.tasks, id, COLUMNS.tasks.projectId) !== projectId) continue;
    if (store.getCell(TABLES.tasks, id, COLUMNS.tasks.parentTaskId) !== undefined) continue;
    out.push(id);
  }
  collectChildIds(store, out[0] ?? '', out);
}

function collectChildIds(
  store: MergeableStore,
  parentId: string,
  out: string[],
): void {
  if (!parentId) return;
  for (const id of store.getRowIds(TABLES.tasks)) {
    if (store.getCell(TABLES.tasks, id, COLUMNS.tasks.parentTaskId) === parentId) {
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
