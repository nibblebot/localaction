import { useMemo, useState } from 'react';
import {
  useDataLayer,
  useStoreVersion,
  useDomainCounts,
  createDomain,
  type DomainCount,
} from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import PromptModal from './PromptModal.tsx';
import SyncStatusBadge from './SyncStatusBadge.tsx';
import { domainColorHex, isDomainColorId } from '../data/colors.ts';
import type { DomainColorId } from '../data/colors.ts';

interface DomainNode {
  count: DomainCount;
  children: DomainNode[];
}

function buildTree(counts: DomainCount[]): DomainNode[] {
  const byId = new Map<string, DomainNode>();
  for (const c of counts) byId.set(c.id, { count: c, children: [] });
  const roots: DomainNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.count.parentId;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Stable order: by name asc, fall back to id.
  const sortRec = (nodes: DomainNode[]): void => {
    nodes.sort((a, b) => {
      const an = a.count.name || '';
      const bn = b.count.name || '';
      if (an !== bn) return an.localeCompare(bn);
      return a.count.id.localeCompare(b.count.id);
    });
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

function getColorHex(raw: string | null | undefined): string {
  return isDomainColorId(raw) ? domainColorHex(raw) : domainColorHex('gray');
}

interface DomainTreeItemProps {
  node: DomainNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function DomainTreeItem({
  node,
  selectedId,
  onSelect,
}: DomainTreeItemProps): React.JSX.Element {
  const isActive = node.count.id === selectedId;
  const dot = getColorHex(node.count.color);
  return (
    <li>
      <div className="sidebar-item-row">
        <button
          type="button"
          className={`sidebar-item${isActive ? ' sidebar-item-active' : ''}${
            node.count.parentId == null ? ' sidebar-item-top' : ''
          }`}
          onClick={() => onSelect(node.count.id)}
        >
          <span
            className={`sidebar-item-dot${
              node.count.parentId == null ? '' : ' sidebar-item-dot-child'
            }`}
            aria-hidden="true"
            style={{ background: dot }}
          />
          <span className="sidebar-item-name">
            {node.count.name || 'Untitled'}
          </span>
          <span className="sidebar-link-count">{node.count.childCount}</span>
        </button>
      </div>
      {node.children.length > 0 && (
        <ul className="sidebar-domain-children" role="list">
          {node.children.map((child) => (
            <DomainTreeItem
              key={child.count.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function Sidebar(): React.JSX.Element {
  const { store } = useDataLayer();
  useStoreVersion(store);
  const counts = useDomainCounts(store);
  const { selection, navigate } = useSelection();
  const [promptOpen, setPromptOpen] = useState(false);
  const tree = useMemo(() => buildTree(counts), [counts]);
  const activeColor: DomainColorId = useMemo(() => {
    if (selection.kind !== 'domain') return 'gray';
    const c = counts.find((x) => x.id === selection.id);
    return c ? c.color : 'gray';
  }, [selection, counts]);

  function createNew(name: string): void {
    const id = createDomain(store, { name, color: activeColor });
    setPromptOpen(false);
    navigate({ kind: 'domain', id });
  }

  const selectedId = selection.kind === 'domain' ? selection.id : null;

  return (
    <aside className="sidebar" aria-label="Sidebar">
      <div className="sidebar-section sidebar-app-name-row">
        <h1 className="sidebar-app-name">LocalAction</h1>
        <SyncStatusBadge />
      </div>

      <div
        className="sidebar-section"
        style={{ flex: '1 1 auto', overflow: 'auto' }}
      >
        <h2 className="sidebar-section-title">
          <span>Domains</span>
          <button
            type="button"
            className="sidebar-section-title-action"
            onClick={() => setPromptOpen(true)}
            aria-label="New domain"
            title="New domain"
          >
            <svg className="svg-icon" aria-hidden="true">
              <use href="/icons.svg#add-icon" />
            </svg>
          </button>
        </h2>
        {tree.length === 0 ? (
          <p className="sidebar-empty">
            No domains yet. Create one to get started.
          </p>
        ) : (
          <ul className="sidebar-section-body" role="list">
            {tree.map((n) => (
              <DomainTreeItem
                key={n.count.id}
                node={n}
                selectedId={selectedId}
                onSelect={(id) => navigate({ kind: 'domain', id })}
              />
            ))}
          </ul>
        )}
      </div>

      <PromptModal
        open={promptOpen}
        title="New domain"
        label="Name"
        placeholder="e.g. Work, Personal, Side project"
        submitLabel="Create"
        onSubmit={createNew}
        onCancel={() => setPromptOpen(false)}
      />
    </aside>
  );
}
