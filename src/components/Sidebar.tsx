import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useDataLayer,
  useAreaCounts,
  createArea,
  moveArea,
  useProject,
  useInboxTaskIds,
  useDueItems,
  type AreaCount,
} from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import { formatRoute, INBOX, TODAY, WEEK } from '../router.ts';
import { todayIso, weekBoundsIso } from './dates.ts';
import { useCollapsedAreas } from './useCollapsedAreas.ts';
import InlineAddInput from './InlineAddInput.tsx';
import SyncStatusBadge from './SyncStatusBadge.tsx';
import AppearanceMenu from './appearance/AppearanceMenu.tsx';
import SidebarResizer from './SidebarResizer.tsx';
import { areaColorHex, type AreaColorId } from '../data/colors.ts';
import { SortableTree } from './SortableTree.tsx';
import type { SortableTreeNode } from './SortableTree.tsx';
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

interface SortableAreaRowProps {
  handle: SortableHandleProps;
  node: AreaNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  isTopLevel: boolean;
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
  collapsed,
  onToggleCollapse,
}: SortableAreaRowProps): React.JSX.Element {
  const isActive = node.count.id === selectedId;
  const displayName = node.count.name || 'Untitled';
  const count = node.count.openTaskCount;
  const classes = ['sidebar-item', 'sidebar-item-drag-handle'];
  const collapsible = collapsed !== null && collapsed !== undefined;
  // Empty areas (nothing inside them yet) recede to 40% opacity,
  // recovering on hover — but never while the area is the active one.
  const empty =
    node.count.taskCount === 0 &&
    node.count.projectCount === 0 &&
    node.count.noteCount === 0;
  if (isActive) classes.push('sidebar-item-active');
  if (isTopLevel) classes.push('sidebar-item-top');
  if (empty && !isActive) classes.push('sidebar-item-dim');
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
          {...(handle.attributes ?? {})}
          className={classes.join(' ')}
          aria-label={count > 0 ? `${displayName}, ${count}` : displayName}
          aria-current={isActive ? 'page' : undefined}
          // Rows with children double as the collapse toggle: there is
          // no separate caret.
          aria-expanded={collapsible ? !collapsed : undefined}
          onClick={(e) => {
            if (handle.isDragging) return;
            e.preventDefault();
            if (collapsible) onToggleCollapse?.(node.count.id);
            onSelect(node.count.id);
          }}
          {...(handle.listeners ?? {})}
        >
          <span
            className="sidebar-item-dot"
            style={{ background: areaColorHex(node.count.color) }}
            aria-hidden="true"
          />
          <span className="sidebar-item-name">{displayName}</span>
          {count > 0 ? <span className="sidebar-link-count">{count}</span> : null}
        </button>
      </div>
    </li>
  );
}

export default function Sidebar({
  ref,
  drawerOpen = false,
  onNavigate,
}: {
  /** Attached to the root <aside> so the app shell can trap focus while
   * the mobile drawer is open (React 19 ref-as-prop). */
  ref?: React.Ref<HTMLElement>;
  /** True only while the sidebar is presented as the mobile drawer:
   * the aside then behaves as a modal dialog instead of a landmark. */
  drawerOpen?: boolean;
  /** Called when the user taps any navigation row (quick link or area).
   * The shell uses it to close the mobile drawer — hashchange alone
   * misses re-taps of the current route, which never fire it. */
  onNavigate?: () => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const counts = useAreaCounts(store);
  const { selection, navigate } = useSelection();
  const newAreaInputRef = useRef<HTMLInputElement>(null);
  // The "New area" field stays hidden until the section's "+" button
  // reveals it (focused); Enter commits and collapses, Esc or blurring
  // an empty field collapses without creating.
  const [showNewArea, setShowNewArea] = useState(false);
  useEffect(() => {
    if (showNewArea) newAreaInputRef.current?.focus();
  }, [showNewArea]);
  const tree = useMemo(() => buildTree(counts), [counts]);
  const { collapsed, toggle: toggleCollapse, replace: replaceCollapsed } =
    useCollapsedAreas();
  // The sortable tree renders the full area tree flattened; collapsed
  // areas contribute their row but not their (hidden) children.
  const sortableNodes = useMemo<readonly SortableTreeNode<string>[]>(() => {
    const map = (ns: AreaNode[]): SortableTreeNode<string>[] =>
      ns.map((n) => ({
        id: n.count.id,
        children: collapsed.has(n.count.id) ? [] : map(n.children),
      }));
    return map(tree);
  }, [tree, collapsed]);
  const nodeById = useMemo(() => {
    const m = new Map<string, AreaNode>();
    const walk = (ns: AreaNode[]): void => {
      for (const n of ns) {
        m.set(n.count.id, n);
        walk(n.children);
      }
    };
    walk(tree);
    return m;
  }, [tree]);
  // A project (or its notes tab) selects its parent area, exactly as
  // if that area itself were being viewed.
  const selectedProject = useProject(
    store,
    selection.kind === 'project' || selection.kind === 'project-notes'
      ? selection.id
      : undefined,
  );
  const selectedId =
    selection.kind === 'area'
      ? selection.id
      : (selectedProject?.areaId ?? null);
  const activeColor: AreaColorId = useMemo(() => {
    const c = counts.find((x) => x.id === selectedId);
    return c ? c.color : 'gray';
  }, [selectedId, counts]);

  const inboxIds = useInboxTaskIds(store);
  const todayItems = useDueItems(store, todayIso(), todayIso());
  const todayOpenCount = todayItems.filter((i) => !i.done).length;

  const week = weekBoundsIso();
  const weekItems = useDueItems(store, week.from, week.to);
  const weekOpenCount = weekItems.filter((i) => !i.done).length;

  // Every node with children is collapsible, at any depth — the
  // collapse-all button reaches them all.
  const collapsibleIds = useMemo<string[]>(() => {
    const ids: string[] = [];
    const walk = (ns: AreaNode[]): void => {
      for (const n of ns) {
        if (n.children.length > 0) ids.push(n.count.id);
        walk(n.children);
      }
    };
    walk(tree);
    return ids;
  }, [tree]);

  // Collapse-all keeps the area shown in the main pane (and its
  // ancestors) expanded so the current context stays visible. The
  // kept set is shared with the all-collapsed predicate below so the
  // button flips to expand-all once everything else is collapsed —
  // otherwise a selected area with sub-areas would pin the button on
  // "Collapse all" forever.
  const keepExpanded = useMemo<ReadonlySet<string>>(() => {
    const keep = new Set<string>();
    for (let cur = selectedId; cur; ) {
      keep.add(cur);
      cur = counts.find((c) => c.id === cur)?.parentId ?? null;
    }
    return keep;
  }, [selectedId, counts]);

  const collapseTargets = useMemo<readonly string[]>(
    () => collapsibleIds.filter((id) => !keepExpanded.has(id)),
    [collapsibleIds, keepExpanded],
  );

  const allCollapsed =
    collapseTargets.length > 0 && collapseTargets.every((id) => collapsed.has(id));

  function toggleAll(): void {
    replaceCollapsed(allCollapsed ? [] : collapseTargets);
  }

  function createNew(name: string): void {
    const id = createArea(store, { name, color: activeColor });
    navigate({ kind: 'area', id });
  }
  function onMoveArea(
    activeId: string,
    parentId: string | null,
    beforeId: string | undefined,
  ): void {
    moveArea(store, activeId, parentId, beforeId);
  }

  return (
    <aside
      ref={ref}
      className="sidebar"
      id="app-sidebar"
      aria-label={drawerOpen ? 'Navigation' : 'Sidebar'}
      role={drawerOpen ? 'dialog' : undefined}
      aria-modal={drawerOpen ? true : undefined}
    >
      <div className="sidebar-section sidebar-app-name-row">
        <img src="/favicon.svg" alt="" width="22" height="22" className="sidebar-app-logo" />
        <h1 className="sidebar-app-name">LocalAction</h1>
      </div>

      <div className="sidebar-section">
        <a
          href={formatRoute(INBOX)}
          onClick={onNavigate}
          className={`sidebar-item sidebar-item-top sidebar-inbox-link${selection.kind === 'inbox' ? ' sidebar-item-active' : ''}`}
          aria-label={inboxIds.length > 0 ? `Inbox, ${inboxIds.length}` : 'Inbox'}
          aria-current={selection.kind === 'inbox' ? 'page' : undefined}
        >
          <span className="sidebar-item-name">Inbox</span>
          {inboxIds.length > 0 ? (
            <span className="sidebar-link-count" aria-label="Inbox task count">
              {inboxIds.length}
            </span>
          ) : null}
        </a>
        <a
          href={formatRoute(TODAY)}
          onClick={onNavigate}
          className={`sidebar-item sidebar-item-top sidebar-today-link${selection.kind === 'today' ? ' sidebar-item-active' : ''}`}
          aria-label={todayOpenCount > 0 ? `Today, ${todayOpenCount}` : 'Today'}
          aria-current={selection.kind === 'today' ? 'page' : undefined}
        >
          <span className="sidebar-item-name">Today</span>
          {todayOpenCount > 0 ? (
            <span className="sidebar-link-count" aria-label="Today due count">
              {todayOpenCount}
            </span>
          ) : null}
        </a>
        <a
          href={formatRoute(WEEK)}
          onClick={onNavigate}
          className={`sidebar-item sidebar-item-top sidebar-week-link${selection.kind === 'week' ? ' sidebar-item-active' : ''}`}
          aria-label={weekOpenCount > 0 ? `Week, ${weekOpenCount}` : 'Week'}
          aria-current={selection.kind === 'week' ? 'page' : undefined}
        >
          <span className="sidebar-item-name">Week</span>
          {weekOpenCount > 0 ? (
            <span className="sidebar-link-count" aria-label="Week due count">
              {weekOpenCount}
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
              className="sidebar-section-title-action icon-button"
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
            className="sidebar-section-title-action icon-button"
            onClick={() => setShowNewArea(true)}
            aria-label="New area"
            title="New area"
          >
            <svg className="svg-icon" aria-hidden="true">
              <use href="/icons.svg#add-icon" />
            </svg>
          </button>
        </h2>
        {tree.length > 0 && (
          <SortableTree
            nodes={sortableNodes}
            onMove={onMoveArea}
            ariaLabel="Areas"
            className="sidebar-section-body"
            indentWidth={16}
          >
            {(id, handle, depth) => {
              const node = nodeById.get(id);
              if (!node) return <></>;
              return (
                <SortableAreaRow
                  handle={handle}
                  node={node}
                  selectedId={selectedId}
                  onSelect={(sid) => {
                    navigate({ kind: 'area', id: sid });
                    onNavigate?.();
                  }}
                  isTopLevel={depth === 0}
                  collapsed={
                    node.children.length > 0
                      ? collapsed.has(node.count.id)
                      : null
                  }
                  onToggleCollapse={toggleCollapse}
                />
              );
            }}
          </SortableTree>
        )}
        {showNewArea && (
          <div
            className="sidebar-section-add"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowNewArea(false);
            }}
            onBlur={(e) => {
              if (
                !e.currentTarget.contains(e.relatedTarget as Node | null) &&
                !newAreaInputRef.current?.value.trim()
              ) {
                setShowNewArea(false);
              }
            }}
          >
            <InlineAddInput
              ref={newAreaInputRef}
              size="sm"
              placeholder="New area…"
              ariaLabel="New area"
              onSubmit={(name) => {
                createNew(name);
                setShowNewArea(false);
              }}
            />
          </div>
        )}
      </div>
      <div className="sidebar-footer">
        <SyncStatusBadge />
        <AppearanceMenu />
      </div>
      <SidebarResizer />
    </aside>
  );
}
