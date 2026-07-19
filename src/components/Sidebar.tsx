import { useMemo, useRef } from 'react';
import {
  useDataLayer,
  useStoreVersion,
  useAreaCounts,
  createArea,
  reorderArea,
  useInboxTaskIds,
  useDimmedAreaIds,
  useFilteredAreaCounts,
  type AreaCount,
} from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import { formatRoute, INBOX } from '../router.ts';
import { useCollapsedAreas } from './useCollapsedAreas.ts';
import InlineAddInput from './InlineAddInput.tsx';
import SyncStatusBadge from './SyncStatusBadge.tsx';
import type { AreaColorId } from '../data/colors.ts';
import { SortableList } from './SortableList.tsx';
import PersonFilterFacet from './persons/PersonFilterFacet.tsx';
import { usePersonFilter } from './persons/usePersonFilter.ts';
import type { SortableHandleProps } from './SortableList.tsx';
import type { FilteredAreaCount } from '../data/index.ts';

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

interface SortableAreaRowProps {
  handle: SortableHandleProps;
  node: AreaNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  isTopLevel: boolean;
  dim: boolean;
  taskCountOverride: number | null;
  /** Present only when this row's children are rendered and collapsible. */
  collapsed?: boolean | null;
  onToggleCollapse?: (id: string) => void;
}

function SortableAreaRow({
  handle,
  node,
  selectedId,
  onSelect,
  isTopLevel,
  dim,
  taskCountOverride,
  collapsed,
  onToggleCollapse,
}: SortableAreaRowProps): React.JSX.Element {
  const isActive = node.count.id === selectedId;
  const displayName = node.count.name || 'Untitled';
  const count = taskCountOverride ?? node.count.taskCount;
  const classes = ['sidebar-item', 'sidebar-item-drag-handle'];
  const collapsible = collapsed !== null && collapsed !== undefined;
  if (isActive) classes.push('sidebar-item-active');
  if (isTopLevel) classes.push('sidebar-item-top');
  if (dim) classes.push('sidebar-item-dim');
  return (
    <li
      ref={handle.ref}
      style={handle.style}
      className={`sidebar-area-row sortable-row${handle.isDragging ? ' sortable-row-active' : ''}${handle.isOver ? ' sortable-row-over' : ''}`}
      data-drag-over={handle.isOver ? 'true' : undefined}
    >
      <div className="sidebar-item-row">
        {isTopLevel &&
          (collapsible ? (
            <button
              type="button"
              className="sidebar-area-caret"
              aria-label={collapsed ? `Expand ${displayName}` : `Collapse ${displayName}`}
              aria-expanded={!collapsed}
              title={collapsed ? 'Expand sub-areas' : 'Collapse sub-areas'}
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse?.(node.count.id);
              }}
            >
              <svg className="svg-icon" aria-hidden="true">
                <use href={`/icons.svg#${collapsed ? 'chevron-right-icon' : 'chevron-down-icon'}`} />
              </svg>
            </button>
          ) : (
            // Fixed-width gutter so top-level names align whether or not
            // the area has a caret.
            <span className="sidebar-area-caret-spacer" aria-hidden="true" />
          ))}
        <button
          type="button"
          className={classes.join(' ')}
          data-dim={dim ? 'true' : 'false'}
          aria-label={`${displayName} (drag to reorder)`}
          title="Drag to reorder"
          onClick={(e) => {
            if (handle.isDragging) return;
            e.preventDefault();
            onSelect(node.count.id);
          }}
          {...(handle.listeners ?? {})}
        >
          <span className="sidebar-item-name">{displayName}</span>
          {count > 0 ? <span className="sidebar-link-count">{count}</span> : null}
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
  dimmed: ReadonlySet<string>;
  filterActive: boolean;
  filtered: Map<string, FilteredAreaCount>;
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
  dimmed,
  filterActive,
  filtered,
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
        const fc = filtered.get(id);
        const override = filterActive
          ? fc
            ? fc.taskCount
            : 0
          : null;
        return (
          <SortableAreaRow
            handle={handle}
            node={child}
            selectedId={selectedId}
            onSelect={onSelect}
            isTopLevel={false}
            dim={dimmed.has(id)}
            taskCountOverride={override}
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
  const newAreaInputRef = useRef<HTMLInputElement>(null);
  const tree = useMemo(() => buildTree(counts), [counts]);
  const { active: filterActive, selected: filterSelected } = usePersonFilter();
  const allAreaIds = useMemo<string[]>(
    () => tree.flatMap(function walk(n: AreaNode): string[] {
      return [n.count.id, ...n.children.flatMap(walk)];
    }),
    [tree],
  );
  const dimmed = useDimmedAreaIds(store, allAreaIds, filterSelected);
  // Under an active filter, show only matching tasks in each area subtree.
  const filtered = useFilteredAreaCounts(store, allAreaIds, filterSelected);
  const activeColor: AreaColorId = useMemo(() => {
    if (selection.kind !== 'area') return 'gray';
    const c = counts.find((x) => x.id === selection.id);
    return c ? c.color : 'gray';
  }, [selection, counts]);

  const inboxIds = useInboxTaskIds(store);
  const { collapsed, toggle: toggleCollapse, replace: replaceCollapsed } = useCollapsedAreas();

  const selectedId = selection.kind === 'area' ? selection.id : null;

  // Only areas with rendered children are collapsible.
  const collapsibleIds = useMemo<string[]>(
    () => tree.filter((n) => n.children.length > 0).map((n) => n.count.id),
    [tree],
  );
  const allCollapsed =
    collapsibleIds.length > 0 && collapsibleIds.every((id) => collapsed.has(id));

  function toggleAll(): void {
    if (allCollapsed) {
      replaceCollapsed([]);
      return;
    }
    // Collapse-all keeps the area shown in the main pane (and its
    // ancestors) expanded so the current context stays visible.
    const keep = new Set<string>();
    for (let cur = selectedId; cur; ) {
      keep.add(cur);
      cur = counts.find((c) => c.id === cur)?.parentId ?? null;
    }
    replaceCollapsed(collapsibleIds.filter((id) => !keep.has(id)));
  }

  function createNew(name: string): void {
    const id = createArea(store, { name, color: activeColor });
    navigate({ kind: 'area', id });
  }
  function onReorder(activeId: string, beforeId: string | undefined): void {
    reorderArea(store, activeId, beforeId);
  }
  const rootIds = tree.map((n) => n.count.id);

  return (
    <aside className="sidebar" aria-label="Sidebar">
      <div className="sidebar-section sidebar-app-name-row">
        <h1 className="sidebar-app-name">LocalAction</h1>
        <SyncStatusBadge />
      </div>
      <PersonFilterFacet />

      <div className="sidebar-section">
        <a
          href={formatRoute(INBOX)}
          className={`sidebar-item sidebar-item-top sidebar-inbox-link${selection.kind === 'inbox' ? ' sidebar-item-active' : ''}`}
          aria-label="Inbox"
        >
          <span className="sidebar-item-name">Inbox</span>
          {inboxIds.length > 0 ? (
            <span className="sidebar-link-count" aria-label="Inbox task count">
              {inboxIds.length}
            </span>
          ) : null}
        </a>
      </div>


      <div
        className="sidebar-section"
        style={{ flex: '1 1 auto', overflow: 'auto' }}
      >
        <h2 className="sidebar-section-title">
          <span>Areas</span>
          {collapsibleIds.length > 0 && (
            <button
              type="button"
              className="sidebar-section-title-action"
              onClick={toggleAll}
              aria-label={allCollapsed ? 'Expand all areas' : 'Collapse all areas'}
              title={allCollapsed ? 'Expand all areas' : 'Collapse all areas'}
            >
              <svg className="svg-icon" aria-hidden="true">
                <use href={`/icons.svg#${allCollapsed ? 'expand-all-icon' : 'collapse-all-icon'}`} />
              </svg>
            </button>
          )}
          <button
            type="button"
            className="sidebar-section-title-action"
            onClick={() => newAreaInputRef.current?.focus()}
            aria-label="New area"
            title="New area"
          >
            <svg className="svg-icon" aria-hidden="true">
              <use href="/icons.svg#add-icon" />
            </svg>
          </button>
        </h2>
        {tree.length > 0 && (
          <SortableList
            itemIds={rootIds}
            onReorder={onReorder}
            ariaLabel="Top-level areas"
            className="sidebar-section-body"
          >
            {(id, handle) => {
              const node = tree.find((n) => n.count.id === id);
              if (!node) return <></>;
              const fc = filtered.get(node.count.id);
              const override = filterActive
                ? fc
                  ? fc.taskCount
                  : 0
                : null;
              return (
                <div className="sidebar-area-li-root">
                  <SortableAreaRow
                    handle={handle}
                    node={node}
                    selectedId={selectedId}
                    onSelect={(sid) => navigate({ kind: 'area', id: sid })}
                    isTopLevel
                    dim={dimmed.has(node.count.id)}
                    taskCountOverride={override}
                    collapsed={node.children.length > 0 ? collapsed.has(node.count.id) : null}
                    onToggleCollapse={toggleCollapse}
                  />
                  {!collapsed.has(node.count.id) && (
                    <SubAreaList
                      parent={node}
                      selectedId={selectedId}
                      onSelect={(sid) => navigate({ kind: 'area', id: sid })}
                      onReorder={onReorder}
                      dimmed={dimmed}
                      filtered={filtered}
                      filterActive={filterActive}
                    />
                  )}
                </div>
              );
            }}
          </SortableList>
        )}
        <div className="sidebar-section-add">
          <InlineAddInput
            ref={newAreaInputRef}
            size="sm"
            placeholder="New area…"
            ariaLabel="New area"
            onSubmit={createNew}
          />
        </div>
      </div>
    </aside>
  );
}
