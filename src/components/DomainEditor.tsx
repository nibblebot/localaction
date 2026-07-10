import { useEffect, useRef, useState } from 'react';
import {
  useDataLayer,
  updateDomain,
  deleteDomain,
  useDomain,
  useStoreVersion,
  useProjects,
  useProject,
  useTasks,
  useChildTasks,
  useTask,
  createProject,
  createTask,
  updateTask,
  deleteTask,
  setTaskStatus,
  isTaskOrphaned,
  TASK_STATUS,
  getDomain,
  getTopLevelDomainIds,
  getDomainPath,
  getChildDomainIds,
} from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import NoteIndicator from './NoteIndicator.tsx';
import EditableTitle from './EditableTitle.tsx';
import ConfirmModal from './ConfirmModal.tsx';
import EntityNote from './EntityNote.tsx';

const NEW_TASK_TITLE = 'New task';
const NEW_PROJECT_NAME = 'New project';

export default function DomainEditor({ id }: { id: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const domain = useDomain(store, id);
  useStoreVersion(store);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!domain) return <></>;

  function remove(): void {
    deleteDomain(store, id);
    navigate({ kind: 'home' });
  }

  const descendants = new Set(collectDescendants(store, id));
  const candidates = getTopLevelDomainIds(store)
    .flatMap((root) => collectDescendants(store, root))
    .filter((cid) => cid !== id && !descendants.has(cid));
  return (
    <div className="entity-editor">
      <div className="entity-editor-head">
        <EditableTitle
          value={domain.name}
          onCommit={(next) => updateDomain(store, id, { name: next })}
          placeholder="Domain name"
        />
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => setConfirmDelete(true)}
        >
          Delete
        </button>
      </div>

      <div className="entity-meta">
        <label className="field">
          <span className="field-label">Parent domain</span>
          <select
            className="field-select"
            value={domain.parentId ?? ''}
            onChange={(e) =>
              updateDomain(store, id, {
                parentId: e.target.value || null,
              })
            }
          >
            <option value="">Top level</option>
            {candidates.map((cid) => {
              const d = getDomain(store, cid);
              if (!d) return null;
              return (
                <option key={cid} value={cid}>
                  {labelForDomain(store, cid)}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      <ProjectsSection domainId={id} />

      <EntityNote entityType="domain" entityId={id} />

      <ConfirmModal
        open={confirmDelete}
        title="Delete domain?"
        message={`“${domain.name || 'Untitled'}” will be deleted. Sub-domains will become orphans.`}
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function ProjectsSection({ domainId }: { domainId: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const projectIds = useProjects(store, domainId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addProject(): void {
    const id = createProject(store, { name: NEW_PROJECT_NAME, domainId });
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  return (
    <section className="entity-projects" aria-label="Projects">
      <header className="entity-projects-head">
        <h3>Projects</h3>
        <button type="button" className="btn" onClick={addProject}>
          + Project
        </button>
      </header>
      {projectIds.length === 0 ? (
        <p className="placeholder">No projects yet.</p>
      ) : (
        <ul className="entity-project-list" role="list">
          {projectIds.map((pid) => (
            <ProjectItem
              key={pid}
              id={pid}
              isOpen={expanded.has(pid)}
              onToggle={() => toggle(pid)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface ProjectItemProps {
  id: string;
  isOpen: boolean;
  onToggle: () => void;
}

function ProjectItem({ id, isOpen, onToggle }: ProjectItemProps): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const project = useProject(store, id);
  const taskIds = useTasks(store, id);
  const [taskExpanded, setTaskExpanded] = useState<Set<string>>(new Set());
  const [justCreatedTaskId, setJustCreatedTaskId] = useState<string | null>(null);

  function toggleTask(tid: string): void {
    setTaskExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tid)) next.delete(tid);
      else next.add(tid);
      return next;
    });
  }

  function addTask(): void {
    const tid = createTask(store, { title: NEW_TASK_TITLE, projectId: id });
    setJustCreatedTaskId(tid);
  }

  function addSubTask(parentId: string): void {
    const tid = createTask(store, {
      title: NEW_TASK_TITLE,
      projectId: id,
      parentTaskId: parentId,
    });
    setTaskExpanded((prev) => {
      const next = new Set(prev);
      next.add(parentId);
      return next;
    });
    setJustCreatedTaskId(tid);
  }

  if (!project) return <></>;
  const name = project.name || 'Untitled';
  const hasChildren = taskIds.length > 0;

  return (
    <li className="entity-project-item">
      <div className="entity-project-row">
        <button
          type="button"
          className="entity-project-caret"
          onClick={onToggle}
          aria-label={isOpen ? 'Collapse project' : 'Expand project'}
          aria-expanded={isOpen}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use
              href={isOpen ? '/icons.svg#caret-down-icon' : '/icons.svg#caret-right-icon'}
            />
          </svg>
        </button>
        <svg className="svg-icon entity-project-icon" aria-hidden="true">
          <use href="/icons.svg#project-icon" />
        </svg>
        <span
          className="entity-project-name"
          onClick={() => navigate({ kind: 'project', id })}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              navigate({ kind: 'project', id });
            }
          }}
        >
          {name}
        </span>
        <NoteIndicator entityType="project" entityId={id} />
        <button
          type="button"
          className="btn btn-ghost entity-project-open"
          title="Open project"
          onClick={() => navigate({ kind: 'project', id })}
        >
          →
        </button>
      </div>
      {isOpen && (
        <div className="entity-project-body">
          {hasChildren ? (
            <ul className="task-list" role="list">
              {taskIds.map((tid) => (
                <InlineTaskItem
                  key={tid}
                  id={tid}
                  depth={0}

                  expanded={taskExpanded}
                  onToggle={toggleTask}
                  justCreatedId={justCreatedTaskId}
                  onFocused={() => setJustCreatedTaskId(null)}
                  onAddSubTask={addSubTask}
                />
              ))}
            </ul>
          ) : (
            <p className="placeholder placeholder-sm">No tasks yet.</p>
          )}
          <button type="button" className="btn btn-ghost entity-project-add-task" onClick={addTask}>
            + Task
          </button>
        </div>
      )}
    </li>
  );
}

interface InlineTaskItemProps {
  id: string;
  depth: number;

  expanded: Set<string>;
  onToggle: (id: string) => void;
  justCreatedId: string | null;
  onFocused: () => void;
  onAddSubTask: (id: string) => void;
}

function InlineTaskItem({
  id,
  depth,

  expanded,
  onToggle,
  justCreatedId,
  onFocused,
  onAddSubTask,
}: InlineTaskItemProps): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const task = useTask(store, id);
  const childIds = useChildTasks(store, id);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (justCreatedId === id && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
      onFocused();
    }
  }, [justCreatedId, id, onFocused]);
  if (!task) return <></>;

  const isOpen = expanded.has(id);
  const done = task.status === TASK_STATUS.done;
  const hasChildren = childIds.length > 0;
  const orphaned = isTaskOrphaned(store, id);

  return (
    <li className="task-item">
      <div
        className={`task-row${done ? ' task-row-done' : ''}`}
        style={{ paddingInlineStart: `${depth * 16}px` }}
      >
        <button
          type="button"
          className="task-caret"
          onClick={() => onToggle(id)}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            <svg className="task-caret-icon" aria-hidden="true">
              <use
                href={isOpen ? '/icons.svg#caret-down-icon' : '/icons.svg#caret-right-icon'}
              />
            </svg>
          ) : null}
        </button>
        <input
          type="checkbox"
          className="task-checkbox"
          checked={done}
          onChange={() =>
            setTaskStatus(store, id, done ? TASK_STATUS.open : TASK_STATUS.done)
          }
          aria-label={done ? 'Mark not done' : 'Mark done'}
        />
        <input
          ref={titleRef}
          className={`task-title${done ? ' task-title-done' : ''}`}
          value={task.title}
          onChange={(e) => updateTask(store, id, { title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          aria-label="Task title"
        />
        <NoteIndicator entityType="task" entityId={id} />
        {orphaned && <span className="pill pill-orphan">Orphaned</span>}
        <span className="task-actions">
          <button
            type="button"
            className="btn btn-ghost"
            title="Add sub-task"
            onClick={() => onAddSubTask(id)}
          >
            +
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            title="Open task"
            onClick={() => navigate({ kind: 'task', id })}
          >
            →
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            title="Delete task"
            onClick={() => deleteTask(store, id)}
          >
            ×
          </button>
        </span>
      </div>
      {isOpen && hasChildren && (
        <ul className="task-list" role="list">
          {childIds.map((cid) => (
            <InlineTaskItem
              key={cid}
              id={cid}
              depth={depth + 1}

              expanded={expanded}
              onToggle={onToggle}
              justCreatedId={justCreatedId}
              onFocused={onFocused}
              onAddSubTask={onAddSubTask}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function labelForDomain(store: ReturnType<typeof useDataLayer>['store'], id: string): string {
  return getDomainPath(store, id)
    .map((d) => d.name || 'Untitled')
    .join(' / ');
}

function collectDescendants(
  store: ReturnType<typeof useDataLayer>['store'],
  rootId: string,
): string[] {
  const out: string[] = [rootId];
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const cid of getChildDomainIds(store, cur)) {
      out.push(cid);
      stack.push(cid);
    }
  }
  return out;
}
