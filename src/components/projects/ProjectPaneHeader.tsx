import { useMemo, useState } from 'react';
import { useRowIds } from 'tinybase/ui-react';
import {
  useDataLayer,
  getArea,
  useProjectRollups,
  captureSubtree,
  restoreSubtree,
  deleteProject,
  TABLES,
  COLUMNS,
  NOTE_ENTITY_TYPE,
} from '../../data/index.ts';
import type { HeaderArea } from '../area/types.ts';
import { useUndo } from '../context/useUndo.ts';
import { useSelection } from '../context/useSelection.ts';
import ConfirmModal from '../shared/ConfirmModal.tsx';
import ProjectDueDateButton from './ProjectDueDateButton.tsx';
import { ProjectPaneActions } from './ProjectActions.tsx';
import ProjectProgressMeter from './ProjectProgressMeter.tsx';
import { INBOX } from '../../router.ts';

export default function ProjectPaneHeader({
  areaId,
  projectId,
  name,
  management,
}: {
  areaId: string | null;
  projectId: string;
  name: string;
  /**
   * Presence opts the header into the full project chrome — progress
   * meter, due-date control, and the pane-only management cluster
   * (notes, rename, delete). The notes pane omits it.
   */
  management?: boolean;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const areaRowIds = useRowIds(TABLES.areas, store);
  const rollups = useProjectRollups(store);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { offerUndo } = useUndo();
  // A single `..` crumb back to the project's own area (its name rides
  // in title/aria-label); ancestors above it are not shown. Mirrors the
  // area header's up-crumb, and clicking returns to the area view.
  const area = useMemo<HeaderArea | null>(() => {
    if (!areaId) return null;
    void areaRowIds.length;
    const direct = getArea(store, areaId);
    return direct ? { id: direct.id, name: direct.name } : null;
  }, [store, areaId, areaRowIds]);
  const display = name || 'Untitled';
  const rollup = rollups.find((r) => r.projectId === projectId);
  return (
    <div className="area-header">
      {area && (
        <>
          <button
            type="button"
            className="area-header-crumb"
            onClick={() => navigate({ kind: 'area', id: area.id })}
            aria-label={`Go to parent area: ${area.name || 'Untitled'}`}
            title={area.name || 'Untitled'}
          >
            ..
          </button>
          <span className="area-header-slash" aria-hidden="true">
            /
          </span>
        </>
      )}
      <svg
        className="svg-icon area-header-project-icon"
        aria-hidden="true"
      >
        <use href="/icons.svg#project-list-icon" />
      </svg>
      {editing && management ? (
        <div className="area-header-edit-row">
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
          {/* The trash rides the rename input and only renders while
              editing. mousedown is suppressed so this click lands
              instead of blurring the input first and unmounting the
              button; the confirm dialog steals focus on open, which
              blurs the input and ends edit mode. */}
          <button
            type="button"
            className="project-row-action project-row-action-danger icon-button area-header-name-delete"
            aria-label="Delete project"
            title="Delete"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setConfirmDelete(true)}
          >
            <svg className="svg-icon" aria-hidden="true">
              <use href="/icons.svg#trash-icon" />
            </svg>
          </button>
        </div>
      ) : management ? (
        <h1 className="area-header-name">
          <button
            type="button"
            className="area-header-name-edit"
            onClick={() => setEditing(true)}
            title="Rename project"
            aria-label={`Rename ${display}`}
          >
            <span className="area-header-name-edit-text">{display}</span>
          </button>
        </h1>
      ) : (
        <h1 className="area-header-name">{display}</h1>
      )}
      {management && <ProjectDueDateButton projectId={projectId} />}
      {management && (
        <div className="project-row-actions">
          <ProjectPaneActions projectId={projectId} display={display} />
          <ProjectProgressMeter done={rollup?.done ?? 0} total={rollup?.total ?? 0} />
        </div>
      )}
      {management && (
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
            navigate(areaId ? { kind: 'area', id: areaId } : INBOX);
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
