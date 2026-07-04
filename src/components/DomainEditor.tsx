/**
 * Right-pane editor for a Domain. Inline title, move-to-parent control
 * (issue 10), delete (issue 02/10), and the Notes panel (issue 07/08).
 */

import { useRow } from 'tinybase/ui-react';
import {
  useDataLayer,
  updateDomain,
  deleteDomain,
  getDomain,
  getTopLevelDomainIds,
  getDomainPath,
  COLUMNS,
  TABLES,
} from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import { EditableTitle } from './EditableTitle.tsx';
import { ConfirmButton } from './ConfirmButton.tsx';
import { NotesPanel } from './NotesPanel.tsx';

export function DomainEditor({ id }: { id: string }): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const domain = useDomainReactive(store, id);
  if (!domain) return <></>;

  function remove(): void {
    deleteDomain(store, id);
    navigate({ kind: 'home' });
  }

  // Candidates for re-parenting: every domain except this one and its
  // descendants (avoids cycles), plus a "Top level" option.
  const descendants = new Set(getDomainPath(store, id).map((d) => d.id));
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
        <ConfirmButton onConfirm={remove} title="Delete domain" />
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

      <NotesPanel entityType="domain" entityId={id} />
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
    for (const cid of store.getRowIds(TABLES.domains)) {
      if (store.getCell(TABLES.domains, cid, COLUMNS.domains.parentId) === cur) {
        out.push(cid);
        stack.push(cid);
      }
    }
  }
  return out;
}

function useDomainReactive(
  store: ReturnType<typeof useDataLayer>['store'],
  id: string,
): { name: string; parentId: string | null } | undefined {
  const row = useRow(TABLES.domains, id, store);
  if (!row || Object.keys(row).length === 0) return undefined;
  const parent = row[COLUMNS.domains.parentId];
  return {
    name: String(row[COLUMNS.domains.name] ?? ''),
    parentId: parent === undefined || parent === null || parent === '' ? null : String(parent),
  };
}