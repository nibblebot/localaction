import {
  useDataLayer,
  createSection,
} from '../../data/index.ts';
import { queueSectionTitleFocus } from '../hooks/taskTitleFocus.ts';
import { requestTaskDraft } from '../hooks/taskDraft.ts';
import { useSelection } from '../context/useSelection.ts';
import ProjectDueDateButton from './ProjectDueDateButton.tsx';
import { NOTES_ENABLED } from '../notes/notesConfig.ts';

/**
 * The add-task "+", pinned right next to the project name — the same
 * slot the section and group headers give their add affordance —
 * instead of buried in the right-edge action cluster. Opens a draft
 * row at the end of the project's unsectioned group; nothing enters
 * the store until the draft commits. Shares the card's hover-reveal
 * chrome (`.project-row-action`).
 */
export function ProjectAddTaskButton({
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
  return (
    <button
      type="button"
      className="project-row-action project-row-add icon-button"
      aria-label={`Add task to ${display}`}
      title="Add task"
      onClick={(e) => {
        e.stopPropagation();
        onEnsureExpanded?.();
        requestTaskDraft({ placement: { kind: 'project', id: projectId } });
      }}
    >
      <svg className="svg-icon" aria-hidden="true">
        <use href="/icons.svg#add-icon" />
      </svg>
    </button>
  );
}

/**
 * The add-section affordance, pinned right next to the add-task "+"
 * on the project row instead of in the right-edge action cluster.
 * Creates an empty section and hands focus to its title input once
 * the row mounts. Shares the card's hover-reveal chrome
 * (`.project-row-action`).
 */
export function ProjectAddSectionButton({
  projectId,
  display,
  hideEmptySections,
  onToggleEmptySections,
  onEnsureExpanded,
}: {
  projectId: string;
  /** Display name for the aria-label. */
  display: string;
  /** Prune section headers with no visible tasks in the task list. */
  hideEmptySections: boolean;
  onToggleEmptySections: () => void;
  /** Expands a collapsed card so the new row can mount (panes omit). */
  onEnsureExpanded?: () => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  return (
    <button
      type="button"
      className="project-row-action icon-button"
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
  );
}

/**
 * The action cluster on a project row in the area view: due date and
 * empty-section pruning. Management affordances (notes, rename,
 * delete) live only on the project detail pane — see
 * `ProjectPaneActions`.
 */
export function ProjectRowActions({
  projectId,
  display,
  hideEmptySections,
  onToggleEmptySections,
}: {
  projectId: string;
  /** Display name for aria-labels. */
  display: string;
  /** Prune section headers with no visible tasks in the task list. */
  hideEmptySections: boolean;
  onToggleEmptySections: () => void;
}): React.JSX.Element {
  return (
    <>
      <ProjectDueDateButton projectId={projectId} />
      {/* Pressed/active state is the toggle's ON state: showing empty
          sections. Hidden-by-default renders it unchecked. */}
      <button
        type="button"
        className={`project-row-action icon-button${hideEmptySections ? '' : ' project-row-action-active'}`}
        aria-label={`${hideEmptySections ? 'Show' : 'Hide'} empty sections in ${display}`}
        aria-pressed={!hideEmptySections}
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
    </>
  );
}

/**
 * The action cluster on the project detail pane header: the notes
 * entry point, which only exists here. The due-date control sits
 * directly against the project title in the pane header, and the
 * empty-sections toggle and `CompletedToggle` live in the task-list
 * head row; the row's card-side actions still live in
 * `ProjectRowActions` for the area-view cards.
 */
export function ProjectPaneActions({
  projectId,
  display,
}: {
  projectId: string;
  /** Display name for aria-labels. */
  display: string;
}): React.JSX.Element {
  const { navigate } = useSelection();
  return (
    <>
      {NOTES_ENABLED && (
        <button
          type="button"
          className="project-row-action icon-button"
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
      )}
    </>
  );
}
