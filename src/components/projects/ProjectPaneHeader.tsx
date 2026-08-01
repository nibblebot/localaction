import { Fragment, useMemo, useState } from 'react';
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
import type { Area } from '../../data/index.ts';
import type { MergeableStore } from 'tinybase';
import { areaColorHex } from '../../data/colors.ts';
import { useUndo } from '../context/useUndo.ts';
import { useSelection } from '../context/useSelection.ts';
import ConfirmModal from '../shared/ConfirmModal.tsx';
import { ProjectPaneActions } from './ProjectActions.tsx';
import ProjectProgressMeter from './ProjectProgressMeter.tsx';
import { INBOX } from '../../router.ts';

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

export default function ProjectPaneHeader({
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
   * Presence opts the header into the full project chrome — progress
   * meter plus the shared row actions (due date, empty-sections) and
   * the pane-only management cluster (notes, rename, delete). The
   * notes pane omits it.
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { offerUndo } = useUndo();
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
      ) : actions ? (
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
      {actions && (
        <div className="project-row-actions">
          <ProjectPaneActions projectId={projectId} display={display} />
          <ProjectProgressMeter done={rollup?.done ?? 0} total={rollup?.total ?? 0} />
        </div>
      )}
      {actions && (
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
      {trailing && <div className="area-header-actions">{trailing}</div>}
    </div>
  );
}
