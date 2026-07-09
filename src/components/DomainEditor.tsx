import { useState } from 'react';
import {
  useDataLayer,
  updateDomain,
  deleteDomain,
  useDomain,
  useStoreVersion,
  getDomain,
  getTopLevelDomainIds,
  getDomainPath,
  getChildDomainIds,
} from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import EditableTitle from './EditableTitle.tsx';
import ConfirmModal from './ConfirmModal.tsx';
// TODO(restore): import NotesPanel from './NotesPanel.tsx';

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

      {/* TODO(restore): <NotesPanel entityType="domain" entityId={id} /> */}

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