import { useMemo, useState } from 'react';
import {
  useDataLayer,
  useStoreVersion,
  useAreaCounts,
  createArea,
  reorderArea,
  type AreaCount,
} from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import PromptModal from './PromptModal.tsx';
import SyncStatusBadge from './SyncStatusBadge.tsx';
import { areaColorHex, isAreaColorId } from '../data/colors.ts';
import type { AreaColorId } from '../data/colors.ts';
import { SortableList } from './SortableList.tsx';
import type { SortableHandleProps } from './SortableList.tsx';

interface AreaNode {
  count: AreaCount;
  children: AreaNode[];
}

function buildTree(counts: AreaCount[]): AreaNode[] {
  const byId = new Map<string, AreaNode>();
  for (const c of counts) byId.set(c.id, { count: c, children: [] });
  const roots: AreaNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.count.parentId;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: AreaNode[]): void => {
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
  return isAreaColorId(raw) ? areaColorHex(raw) : areaColorHex('gray');
}

interface SortableAreaRowProps {
  handle: SortableHandleProps;
  node: AreaNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  isTopLevel: boolean;
}

function SortableAreaRow({
  handle,
  node,
  selectedId,
  onSelect,
  isTopLevel,
}: SortableAreaRowProps): React.JSX.Element {
  const isActive = node.count.id === selectedId;
  const dot = getColorHex(node.count.color);
  const displayName = node.count.name || 'Untitled';
  return (
    <li
      ref={handle.ref}
      style={handle.style}
      className={`sidebar-area-row sortable-row${handle.isDragging ? ' sortable-row-active' : ''}${handle.isOver ? ' sortable-row-over' : ''}`}
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

interface SubAreaListProps {
  parent: AreaNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (activeId: string, beforeId: string | undefined) => void;
}

/**
 * Sub-areas under a single parent, in their own SortableList so
 * reordering is scoped to siblings. Dragging across parents is not
 * supported by drag (slice 10 owns that explicit Move action).
 */
function SubAreaList({
  parent,
  selectedId,
  onSelect,
  onReorder,
}: SubAreaListProps): React.JSX.Element | null {
  if (parent.children.length === 0) return null;
  return (
    <SortableList
      itemIds={parent.children.map((c) => c.count.id)}
      onReorder={onReorder}
      ariaLabel={`Sub-areas of ${parent.count.name || 'Untitled'}`}
      className="sidebar-area-siblings"
    >
      {(id, handle) => {
        const child = parent.children.find((c) => c.count.id === id);
        if (!child) return <></>;
        return (
          <SortableAreaRow
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
  const counts = useAreaCounts(store);
  const { selection, navigate } = useSelection();
  const [promptOpen, setPromptOpen] = useState(false);
  const tree = useMemo(() => buildTree(counts), [counts]);
  const activeColor: AreaColorId = useMemo(() => {
    if (selection.kind !== 'area') return 'gray';
    const c = counts.find((x) => x.id === selection.id);
    return c ? c.color : 'gray';
  }, [selection, counts]);

  function createNew(name: string): void {
    const id = createArea(store, { name, color: activeColor });
    setPromptOpen(false);
    navigate({ kind: 'area', id });
  }

  function onReorder(activeId: string, beforeId: string | undefined): void {
    reorderArea(store, activeId, beforeId);
  }

  const selectedId = selection.kind === 'area' ? selection.id : null;
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
          <span>Areas</span>
          <button
            type="button"
            className="sidebar-section-title-action"
            onClick={() => setPromptOpen(true)}
            aria-label="New area"
            title="New area"
          >
            <svg className="svg-icon" aria-hidden="true">
              <use href="/icons.svg#add-icon" />
            </svg>
          </button>
        </h2>
        {tree.length === 0 ? (
          <p className="sidebar-empty">
            No areas yet. Create one to get started.
          </p>
        ) : (
          <SortableList
            itemIds={rootIds}
            onReorder={onReorder}
            ariaLabel="Top-level areas"
            className="sidebar-section-body"
          >
            {(id, handle) => {
              const node = tree.find((n) => n.count.id === id);
              if (!node) return <></>;
              return (
                <div className="sidebar-area-li-root">
                  <SortableAreaRow
                    handle={handle}
                    node={node}
                    selectedId={selectedId}
                    onSelect={(sid) => navigate({ kind: 'area', id: sid })}
                    isTopLevel
                  />
                  <SubAreaList
                    parent={node}
                    selectedId={selectedId}
                    onSelect={(sid) => navigate({ kind: 'area', id: sid })}
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
        title="New area"
        label="Name"
        placeholder="e.g. Work, Personal, Side project"
        submitLabel="Create"
        onSubmit={createNew}
        onCancel={() => setPromptOpen(false)}
      />
    </aside>
  );
}
