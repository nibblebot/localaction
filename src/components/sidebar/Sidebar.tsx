import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useDataLayer,
  useAreaCounts,
  createArea,
  moveArea,
  getRootPlacement,
  getRootTriState,
  useInboxTaskIds,
  useDueItems,
  type AreaCount,
} from '../../data/index.ts';
import { useSelection } from '../context/useSelection.ts';
import { formatRoute, INBOX, TODAY, WEEK } from '../../router.ts';
import { todayIso, weekBoundsIso } from '../shared/dates.ts';
import InlineAddInput from '../shared/InlineAddInput.tsx';
import SyncStatusBadge from '../shared/SyncStatusBadge.tsx';
import AppearanceMenu from '../appearance/AppearanceMenu.tsx';
import SidebarResizer from './SidebarResizer.tsx';
import { areaColorHex, type AreaColorId } from '../../data/colors.ts';
import { SortableTree } from '../dnd/SortableTree.tsx';
import type { SortableTreeNode } from '../dnd/SortableTree.tsx';
import { useCollapsedSet } from '../hooks/useCollapsedSet.ts';
import type { SortableHandleProps } from '../dnd/SortableList.tsx';

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
  /** True while this area's subareas are hidden (caret points right). */
  collapsed: boolean;
  /** Toggles the subarea subtree; only meaningful when the node has children. */
  onToggleCollapse: () => void;
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
  const hasChildren = node.children.length > 0;
  const classes = ['sidebar-item', 'sidebar-item-drag-handle'];
  // Empty areas and areas whose remaining tasks are all Done recede to
  // 40% opacity. Notes-only areas stay fully visible, and the open-task
  // counter is already omitted at zero. Keep the selected area emphasized.
  const inactive =
    node.count.openTaskCount === 0 && (node.count.taskCount > 0 || node.count.noteCount === 0);
  if (isActive) classes.push('sidebar-item-active');
  if (isTopLevel) classes.push('sidebar-item-top');
  if (inactive && !isActive) classes.push('sidebar-item-dim');
  return (
    <li
      ref={handle.ref}
      style={handle.style}
      className={`sidebar-area-row sortable-row${handle.isDragging ? ' sortable-row-active' : ''}${handle.isOver ? ' sortable-row-over' : ''}`}
      data-drag-over={handle.isOver ? 'true' : undefined}
    >
      <div className="sidebar-item-row">
        {hasChildren ? (
          <button
            type="button"
            className="sidebar-area-caret"
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Expand ${displayName}` : `Collapse ${displayName}`}
            title={collapsed ? `Expand ${displayName}` : `Collapse ${displayName}`}
            onClick={onToggleCollapse}
          >
            <svg className="svg-icon" aria-hidden="true">
              <use href={`/icons.svg#${collapsed ? 'chevron-right-icon' : 'chevron-down-icon'}`} />
            </svg>
          </button>
        ) : null}
        <button
          type="button"
          {...(handle.attributes ?? {})}
          className={classes.join(' ')}
          aria-label={count > 0 ? `${displayName}, ${count}` : displayName}
          aria-current={isActive ? 'page' : undefined}
          onClick={(e) => {
            if (handle.isDragging) return;
            e.preventDefault();
            onSelect(node.count.id);
          }}
          {...(handle.listeners ?? {})}
        >
          {hasChildren ? null : (
            <span
              className="sidebar-item-dot"
              style={{ background: areaColorHex(node.count.color) }}
              aria-hidden="true"
            />
          )}
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
  // Sidebar area collapse — pure view state, localStorage-backed like
  // the other collapse sets (device-local, never synced).
  const { collapsed: collapsedAreas, toggle: toggleAreaCollapsed } = useCollapsedSet(
    'localaction.sidebar.collapsedAreaIds',
  );
  const tree = useMemo(() => buildTree(counts), [counts]);
  const sortableNodes = useMemo<readonly SortableTreeNode<string>[]>(() => {
    // Collapsed parents pass `children: []` — the SortableTree contract
    // for hiding a subtree (hidden rows can't be drop targets either).
    const map = (ns: AreaNode[]): SortableTreeNode<string>[] =>
      ns.map((n) => ({
        id: n.count.id,
        children: collapsedAreas.has(n.count.id) ? [] : map(n.children),
      }));
    return map(tree);
  }, [tree, collapsedAreas]);
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
  // A task pane selects its owning area (resolved through the placement
  // chain); an inbox-rooted task selects nothing, exactly as if the inbox
  // itself were being viewed.
  const selectedTaskAreaId = useMemo(() => {
    if (selection.kind !== 'task') return null;
    const root = getRootPlacement(store, selection.id);
    return root.kind === 'area' ? root.id : null;
  }, [store, selection]);
  const selectedId =
    selection.kind === 'area'
      ? selection.id
      : selection.kind === 'task'
        ? selectedTaskAreaId
        : null;
  const activeColor: AreaColorId = useMemo(() => {
    const c = counts.find((x) => x.id === selectedId);
    return c ? c.color : 'gray';
  }, [selectedId, counts]);

  const inboxIds = useInboxTaskIds(store);
  // Match Today/Week (open items only) and the area pills
  // (openTaskCount): a Done root is visible in the Inbox pane but no
  // longer actionable, so it leaves the sidebar count.
  const inboxOpenCount = inboxIds.filter((id) => getRootTriState(store, id) !== 'done').length;
  const todayItems = useDueItems(store, todayIso(), todayIso());
  const todayOpenCount = todayItems.filter((i) => !i.done).length;

  const week = weekBoundsIso();
  const weekItems = useDueItems(store, week.from, week.to);
  const weekOpenCount = weekItems.filter((i) => !i.done).length;

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
          aria-label={inboxOpenCount > 0 ? `Inbox, ${inboxOpenCount}` : 'Inbox'}
          aria-current={selection.kind === 'inbox' ? 'page' : undefined}
        >
          <span className="sidebar-item-name">Inbox</span>
          {inboxOpenCount > 0 ? (
            <span className="sidebar-link-count" aria-label="Inbox task count">
              {inboxOpenCount}
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

      <div className="sidebar-section" style={{ flex: '1 1 auto', overflow: 'auto' }}>
        <h2 className="sidebar-section-title">
          <span>Areas</span>
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
            externalDndContext
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
                  collapsed={collapsedAreas.has(id)}
                  onToggleCollapse={() => toggleAreaCollapsed(id)}
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
