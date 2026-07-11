import { useMemo, useState } from 'react';
import {
  useDataLayer,
  useStoreVersion,
  useDomainCounts,
  createDomain,
  reorderDomain,
  type DomainCount,
} from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import PromptModal from './PromptModal.tsx';
import SyncStatusBadge from './SyncStatusBadge.tsx';
import { domainColorHex, isDomainColorId } from '../data/colors.ts';
import type { DomainColorId } from '../data/colors.ts';
import { SortableList } from './SortableList.tsx';
import type { SortableHandleProps } from './SortableList.tsx';

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
  const sortRec = (nodes: DomainNode[]): void => {
    nodes.sort((a, b) => {
      if (a.count.order !== b.count.order) return a.count.order - b.count.order;
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

interface SortableDomainRowProps {
  handle: SortableHandleProps;
  node: DomainNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  isTopLevel: boolean;
}

function SortableDomainRow({
  handle,
  node,
  selectedId,
  onSelect,
  isTopLevel,
}: SortableDomainRowProps): React.JSX.Element {
  const isActive = node.count.id === selectedId;
  const dot = getColorHex(node.count.color);
  const displayName = node.count.name || 'Untitled';
  return (
    <li
      ref={handle.ref}
      style={handle.style}
      className={`sidebar-domain-row sortable-row${handle.isDragging ? ' sortable-row-active' : ''}${handle.isOver ? ' sortable-row-over' : ''}`}
      data-drag-over={handle.isOver ? 'true' : undefined}
    >
      <div className="sidebar-item-row">
        <button
          type="button"
          className={`sidebar-item sidebar-item-drag-handle${isActive ? ' sidebar-item-active' : ''}${
            isTopLevel ? ' sidebar-item-top' : ''
          }`}
          aria-label={`${displayName} (drag to reorder)`}
          title="Drag to reorder"
          onClick={(e) => {
            if (handle.isDragging) return;
            e.preventDefault();
            onSelect(node.count.id);
          }}
          {...(handle.listeners ?? {})}
        >
          <span
            className={`sidebar-item-dot${isTopLevel ? '' : ' sidebar-item-dot-child'}`}
            aria-hidden="true"
            style={{ background: dot }}
          />
          <span className="sidebar-item-name">{displayName}</span>
          <span className="sidebar-link-count">{node.count.childCount}</span>
        </button>
      </div>
    </li>
  );
}

interface SubDomainListProps {
  parent: DomainNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (activeId: string, beforeId: string | undefined) => void;
}

/**
 * Sub-domains under a single parent, in their own SortableList so
 * reordering is scoped to siblings. Dragging across parents is not
 * supported by drag (slice 10 owns that explicit Move action).
 */
function SubDomainList({
  parent,
  selectedId,
  onSelect,
  onReorder,
}: SubDomainListProps): React.JSX.Element | null {
  if (parent.children.length === 0) return null;
  return (
    <SortableList
      itemIds={parent.children.map((c) => c.count.id)}
      onReorder={onReorder}
      ariaLabel={`Sub-domains of ${parent.count.name || 'Untitled'}`}
      className="sidebar-domain-siblings"
    >
      {(id, handle) => {
        const child = parent.children.find((c) => c.count.id === id);
        if (!child) return <></>;
        return (
          <SortableDomainRow
            handle={handle}
            node={child}
            selectedId={selectedId}
            onSelect={onSelect}
            isTopLevel={false}
          />
        );
      }}
    </SortableList>
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

  function onReorder(activeId: string, beforeId: string | undefined): void {
    reorderDomain(store, activeId, beforeId);
  }

  const selectedId = selection.kind === 'domain' ? selection.id : null;
  const rootIds = tree.map((n) => n.count.id);

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
          <SortableList
            itemIds={rootIds}
            onReorder={onReorder}
            ariaLabel="Top-level domains"
            className="sidebar-section-body"
          >
            {(id, handle) => {
              const node = tree.find((n) => n.count.id === id);
              if (!node) return <></>;
              return (
                <div className="sidebar-domain-li-root">
                  <SortableDomainRow
                    handle={handle}
                    node={node}
                    selectedId={selectedId}
                    onSelect={(sid) => navigate({ kind: 'domain', id: sid })}
                    isTopLevel
                  />
                  <SubDomainList
                    parent={node}
                    selectedId={selectedId}
                    onSelect={(sid) => navigate({ kind: 'domain', id: sid })}
                    onReorder={onReorder}
                  />
                </div>
              );
            }}
          </SortableList>
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
