/**
 * Right-pane editor for a Project. Inline title, move-to-domain control
 * (issue 10), delete, the Task list (issues 05/06), and the Notes panel.
 */

import { useRow } from 'tinybase/ui-react';
import {
  useDataLayer,
  updateProject,
  deleteProject,
  getDomain,
  getTopLevelDomainIds,
  COLUMNS,
  TABLES,
} from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import { EditableTitle } from './EditableTitle.tsx';
import { ConfirmButton } from './ConfirmButton.tsx';
import { TaskList } from './TaskList.tsx';
import { NotesPanel } from './NotesPanel.tsx';

export function ProjectEditor({ id }: { id: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const project = useProjectReactive(store, id);
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
        <ConfirmButton onConfirm={remove} title="Delete project" />
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
                  {d.name || 'Untitled'}
                </option>
              );
            })}
          </select>
        </label>
      </div>

      <TaskList projectId={id} />
      <NotesPanel entityType="project" entityId={id} />
    </div>
  );
}

function getAllDomainIdsFlat(store: ReturnType<typeof useDataLayer>['store']): string[] {
  const out: string[] = [];
  const walk = (parentId: string | null): void => {
    for (const cid of store.getRowIds(TABLES.domains)) {
      const p = store.getCell(TABLES.domains, cid, COLUMNS.domains.parentId);
      if ((p ?? null) === parentId) {
        out.push(cid);
        walk(cid);
      }
    }
  };
  walk(null);
  // Ensure top-level list seed for the empty-store case.
  if (out.length === 0) getTopLevelDomainIds(store);
  return out;
}

function useProjectReactive(
  store: ReturnType<typeof useDataLayer>['store'],
  id: string,
): { name: string; domainId: string | null } | undefined {
  const row = useRow(TABLES.projects, id, store);
  if (!row || Object.keys(row).length === 0) return undefined;
  const domainId = row[COLUMNS.projects.domainId];
  return {
    name: String(row[COLUMNS.projects.name] ?? ''),
    domainId: domainId === undefined || domainId === null || domainId === '' ? null : String(domainId),
  };
}