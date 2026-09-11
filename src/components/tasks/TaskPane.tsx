import { useMemo, useState } from 'react';
import {
  useDataLayer,
  useTask,
  useDerivedTaskStatus,
  useTableVersion,
  TABLES,
  updateTask,
  deleteTask,
  captureSubtree,
  restoreSubtree,
  getPlacement,
  getRootPlacement,
  setRootBacklog,
  childTaskIds,
  sortTaskIds,
  moveTask,
  PLACEMENT_SEP,
  NOTE_ENTITY_TYPE,
  TASK_STATUS,
} from '../../data/index.ts';
import { useSelection } from '../context/useSelection.ts';
import { useUndo } from '../context/useUndo.ts';
import { useShowCompleted } from '../hooks/useShowCompleted.ts';
import EmptyState from '../shared/EmptyState.tsx';
import ConfirmModal from '../shared/ConfirmModal.tsx';
import CompletedToggle from '../shared/CompletedToggle.tsx';
import { INBOX } from '../../router.ts';
import TaskTree from './TaskTree.tsx';
import TaskDueDateButton from './TaskDueDateButton.tsx';
import TaskProgressMeter from './TaskProgressMeter.tsx';
import { requestTaskDraft } from '../hooks/taskDraft.ts';
import { NOTES_ENABLED } from '../notes/notesConfig.ts';
import TaskNotesBody from '../notes/TaskNotesBody.tsx';

/**
 * Task detail pane (`#/t/<id>`) — the standalone form of a parent task,
 * reachable by clicking a parent task's name anywhere it renders. Works at
 * any depth: the header shows an inline rename, a due date, a delete, the
 * completed-tasks visibility toggle, and (roots only) a Backlog toggle;
 * the body renders the task's children as the roots of a subtree TaskTree.
 * A back affordance returns to the parent task's pane (sub-task) or to the
 * owning area / inbox (root). The task's note body editor lives below the
 * subtree (task-scoped notes), gated by NOTES_ENABLED.
 */
export default function TaskPane({ taskId }: { taskId: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const { offerUndo } = useUndo();
  const task = useTask(store, taskId);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { showCompleted, toggle: toggleShowCompleted } = useShowCompleted();

  // The task's own placement: `task:<parentId>` marks a sub-task whose
  // parent gets its own pane; anything else is a root.
  const placement = useMemo(
    () => (task ? getPlacement(store, taskId) : null),
    [store, task, taskId],
  );
  const isRoot = placement !== null && placement.kind !== 'task';

  // Children of this task, in canonical order, rendered as subtree roots.
  // The tasks-table version token makes this reactive to CHILD adds
  // (useTask only subscribes to the pane task's own row).
  const tasksV = useTableVersion(store, TABLES.tasks);
  // The tasks table version is threaded through so the React Compiler
  // treats this memo as table-reactive (a bare `void tasksV` gets
  // elided): child adds from the pane's own add-sub-task must re-list.
  const childIds = useMemo(
    () =>
      task
        ? sortTaskIds(store, childTaskIds(store, taskId)).filter(
            (_, i) => i >= 0 || tasksV > -1,
          )
        : [],
    [store, task, taskId, tasksV],
  );
  // Reactive tri-state: derived from the row's cells (backlog + derived
  // status) so the toggle re-renders when `setRootBacklog` writes.
  const derived = useDerivedTaskStatus(store, taskId);

  if (!task || placement === null) {
    return <EmptyState message="This task no longer exists." />;
  }

  const display = task.title || 'Untitled';
  const triState =
    isRoot && task !== undefined
      ? derived === TASK_STATUS.done
        ? 'done'
        : task.backlog
          ? 'backlog'
          : 'active'
      : null;

  /** Back affordance: sub-task → parent pane; root → owning area / inbox. */
  function goBack(): void {
    if (placement!.kind === 'task') {
      navigate({ kind: 'task', id: placement!.id });
      return;
    }
    const root = getRootPlacement(store, taskId);
    if (root.kind === 'area') navigate({ kind: 'area', id: root.id });
    else navigate(INBOX);
  }

  function onMove(
    activeId: string,
    parentId: string | null,
    beforeId: string | undefined,
  ): void {
    // A root-level drop inside this pane means "direct child of the
    // viewed task"; a nested drop targets the named parent task.
    moveTask(
      store,
      activeId,
      `task${PLACEMENT_SEP}${parentId ?? taskId}`,
      beforeId,
    );
  }

  return (
    <main className="main" aria-label="Editor">
      <div className="main-body">
        <div className="area-header">
          <button
            type="button"
            className="area-header-crumb"
            onClick={goBack}
            aria-label="Go back"
            title="Back"
          >
            ..
          </button>
          <span className="area-header-slash" aria-hidden="true">
            /
          </span>
          {editing ? (
            <div className="area-header-edit-row">
              <input
                type="text"
                className="area-header-add-input"
                aria-label="Task name"
                defaultValue={display}
                autoFocus
                onBlur={(e) => {
                  const next = e.currentTarget.value.trim() || 'Untitled';
                  if (next !== display) updateTask(store, taskId, { title: next });
                  setEditing(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  else if (e.key === 'Escape') setEditing(false);
                }}
              />
              {/* The trash rides the rename input and only renders while
                  editing. mousedown is suppressed so this click lands
                  instead of blurring the input first and unmounting the
                  button; the confirm dialog steals focus on open, which
                  blurs the input and ends edit mode. */}
              <button
                type="button"
                className="project-row-action project-row-action-danger icon-button area-header-name-delete"
                aria-label="Delete task"
                title="Delete"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setConfirmDelete(true)}
              >
                <svg className="svg-icon" aria-hidden="true">
                  <use href="/icons.svg#trash-icon" />
                </svg>
              </button>
            </div>
          ) : (
            <h1 className="area-header-name">
              <button
                type="button"
                className="area-header-name-edit"
                onClick={() => setEditing(true)}
                title="Rename task"
                aria-label={`Rename ${display}`}
              >
                <span className="area-header-name-edit-text">{display}</span>
              </button>
            </h1>
          )}
          <TaskDueDateButton taskId={taskId} />
          <div className="project-row-actions">
            {isRoot && (
              <button
                type="button"
                className="btn btn-sm"
                aria-pressed={triState === 'backlog'}
                title={triState === 'backlog' ? 'Move to Active' : 'Move to Backlog'}
                onClick={() => setRootBacklog(store, taskId, triState !== 'backlog')}
              >
                {triState === 'backlog' ? 'Backlog' : 'Active'}
              </button>
            )}
            <CompletedToggle showCompleted={showCompleted} onToggle={toggleShowCompleted} />
            <TaskProgressMeter taskId={taskId} />
          </div>
          <ConfirmModal
            open={confirmDelete}
            title="Delete task?"
            message={`"${display}" will be deleted along with its subtasks and notes.`}
            confirmLabel="Delete"
            onConfirm={() => {
              const snapshot = captureSubtree(store, NOTE_ENTITY_TYPE.task, taskId);
              // Resolve the fallback destination BEFORE deleting — the
              // row (and its placement) vanish with the cascade.
              const backPlacement = placement!;
              const backRoot = getRootPlacement(store, taskId);
              deleteTask(store, taskId);
              setConfirmDelete(false);
              offerUndo({
                label: `Deleted “${display}”`,
                onUndo: () => restoreSubtree(store, snapshot),
              });
              if (backPlacement.kind === 'task') {
                navigate({ kind: 'task', id: backPlacement.id });
              } else if (backRoot.kind === 'area') {
                navigate({ kind: 'area', id: backRoot.id });
              } else {
                navigate(INBOX);
              }
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        </div>
        <section className="tasks-tab project-pane-tasks" aria-label="Subtasks">
          <TaskTree
            rootIds={childIds}
            onMove={onMove}
            showCompleted={showCompleted}
            draftRootTaskId={taskId}
          />
          <div className="pane-section-head-actions">
            <button
              type="button"
              className="project-row-action project-row-add icon-button"
              aria-label={`Add sub-task to ${display}`}
              title="Add sub-task"
              onClick={() => requestTaskDraft({ placement: { kind: 'task', id: taskId } })}
            >
              <svg className="svg-icon" aria-hidden="true">
                <use href="/icons.svg#add-icon" />
              </svg>
            </button>
          </div>
        </section>
        {NOTES_ENABLED && (
          <section className="notes-tab" aria-label="Notes">
            <TaskNotesBody taskId={taskId} />
          </section>
        )}
      </div>
    </main>
  );
}