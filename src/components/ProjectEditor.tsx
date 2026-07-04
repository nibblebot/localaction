import { useState } from 'react';
import {
  useDataLayer,
  updateProject,
  deleteProject,
  useProject,
  getDomain,
  getAllDomainIdsFlat,
  getDomainPath,
} from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import EditableTitle from './EditableTitle.tsx';
import ConfirmModal from './ConfirmModal.tsx';
import TaskList from './TaskList.tsx';
import NotesPanel from './NotesPanel.tsx';

export default function ProjectEditor({ id }: { id: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const project = useProject(store, id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!project) return <></>;

  function remove(): void {
    deleteProject(store, id);
    navigate({ kind: 'home' });
  }

  const allDomainIds = getAllDomainIdsFlat(store);

  return (
    <div className="entity-editor">
      <div className="entity-editor-head">
        <EditableTitle
          value={project.name}
          onCommit={(next) => updateProject(store, id, { name: next })}
          placeholder="Project name"
        />
        <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
          Delete
        </button>
      </div>

      <div className="entity-meta">
        <label className="field">
          <span className="field-label">Domain</span>
          <select
            className="field-select"
            value={project.domainId ?? ''}
            onChange={(e) =>
              updateProject(store, id, { domainId: e.target.value })
            }
          >
            {allDomainIds.map((cid) => {
              const d = getDomain(store, cid);
              if (!d) return null;
              return (
                <option key={cid} value={cid}>
                  {getDomainPath(store, cid)
                    .map((dn) => dn.name || 'Untitled')
                    .join(' / ')}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      <TaskList projectId={id} />
      <NotesPanel entityType="project" entityId={id} />

      <ConfirmModal
        open={confirmDelete}
        title="Delete project?"
        message={`“${project.name || 'Untitled'}” will be deleted. Tasks and notes attached to it will become orphans.`}
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}