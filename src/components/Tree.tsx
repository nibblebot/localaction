/**
 * Left-pane tree: Domains (with arbitrary sub-Domain nesting) and the
 * Projects under each. Top-level Domains come from `useDomains`; orphans
 * (Domains whose parent was deleted) surface in a separate section with an
 * "Orphaned" pill so the user can re-attach them.
 *
 * Expand/collapse is local UI state keyed by domain id. The selection's
 * domain-ancestor chain is auto-expanded (merged into that state via an
 * effect) so deep-linking / navigating into a sub-Domain always reveals it.
 */

import { useEffect, useState } from 'react';
import { useRow, useTables } from 'tinybase/ui-react';
import {
  useDataLayer,
  useDomains,
  useChildDomains,
  useProjects,
  createDomain,
  createProject,
  deleteDomain,
  deleteProject,
  getDomainPath,
  getOrphanedDomainIds,
  getProject,
  getTask,
  COLUMNS,
  TABLES,
} from '../data/index.ts';
import type { MergeableStore } from 'tinybase';
import type { Selection } from '../router.ts';
import { useSelection } from './useSelection.ts';
import { ConfirmButton } from './ConfirmButton.tsx';

const NEW_DOMAIN_NAME = 'New Domain';
const NEW_SUBDOMAIN_NAME = 'New Sub-Domain';
const NEW_PROJECT_NAME = 'New Project';

export function Tree(): React.JSX.Element {
  const { store } = useDataLayer();
  const { selection, navigate } = useSelection();
  const rootIds = useDomains(store);
  const orphanIds = getOrphanedDomainIds(store);
  // Orphan ids are derived (not a hook) — subscribe to tables so the
  // derived list refreshes when a parent is deleted.
  useTables(store);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Auto-expand every domain on the selection's domain-ancestor chain.
  useEffect(() => {
    const wanted = expandedDomainIdsForSelection(store, selection);
    if (wanted.size === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const id of wanted) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [store, selection]);

  function toggle(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expand(id: string): void {
    setExpanded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }

  function addTopLevelDomain(): void {
    const id = createDomain(store, { name: NEW_DOMAIN_NAME });
    navigate({ kind: 'domain', id });
  }

  return (
    <aside className="pane pane-left" aria-label="Tree">
      <header className="pane-header">
        <div className="pane-title-row">
          <h2>Tree</h2>
          <button type="button" className="btn" onClick={addTopLevelDomain}>
            + Domain
          </button>
        </div>
      </header>
      <div className="pane-body tree-body">
        <ul className="tree-list" role="tree">
          {rootIds.map((id) => (
            <DomainNode
              key={id}
              id={id}
              depth={0}
              expanded={expanded}
              onToggle={toggle}
              onExpand={expand}
            />
          ))}
        </ul>

        {orphanIds.length > 0 && (
          <section className="tree-orphans" aria-label="Orphaned domains">
            <h3 className="tree-section-title">Orphaned</h3>
            <ul className="tree-list">
              {orphanIds.map((id) => (
                <DomainNode
                  key={id}
                  id={id}
                  depth={0}
                  expanded={expanded}
                  onToggle={toggle}
                  onExpand={expand}
                  orphaned
                />
              ))}
            </ul>
          </section>
        )}

        {rootIds.length === 0 && orphanIds.length === 0 && (
          <p className="placeholder">
            No domains yet. Click <strong>+ Domain</strong> to create your first area of life.
          </p>
        )}
      </div>
    </aside>
  );
}

interface NodeSharedProps {
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onExpand: (id: string) => void;
}

interface DomainNodeProps extends NodeSharedProps {
  id: string;
  depth: number;
  orphaned?: boolean;
}

function DomainNode({ id, depth, expanded, onToggle, onExpand, orphaned }: DomainNodeProps): React.JSX.Element {
  const { store } = useDataLayer();
  const { selection, navigate } = useSelection();
  const domain = useDomainReactive(store, id);
  const childIds = useChildDomains(store, id);
  const projectIds = useProjects(store, id);

  const isOpen = expanded.has(id);
  const isSelected = selection.kind === 'domain' && selection.id === id;

  if (!domain) return <></>;

  function addSubDomain(): void {
    const child = createDomain(store, { name: NEW_SUBDOMAIN_NAME, parentId: id });
    onExpand(id);
    navigate({ kind: 'domain', id: child });
  }

  function addProject(): void {
    const pid = createProject(store, { name: NEW_PROJECT_NAME, domainId: id });
    onExpand(id);
    navigate({ kind: 'project', id: pid });
  }

  function remove(): void {
    deleteDomain(store, id);
    if (isSelected) navigate({ kind: 'home' });
  }

  return (
    <li className="tree-node" role="treeitem" aria-expanded={isOpen || undefined}>
      <div
        className={`tree-row${isSelected ? ' tree-row-selected' : ''}`}
        style={{ paddingInlineStart: `${depth * 14}px` }}
      >
        <button
          type="button"
          className="tree-caret"
          onClick={() => onToggle(id)}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          {childIds.length > 0 || projectIds.length > 0 ? (isOpen ? '▾' : '▸') : '•'}
        </button>
        <button type="button" className="tree-label" onClick={() => navigate({ kind: 'domain', id })}>
          <span className="tree-icon" aria-hidden="true">◈</span>
          <span className="tree-name">{domain.name || 'Untitled'}</span>
          {orphaned && <span className="pill pill-orphan">Orphaned</span>}
        </button>
        <span className="tree-actions">
          <button type="button" className="btn btn-ghost" title="Add sub-domain" onClick={addSubDomain}>
            +
          </button>
          <button type="button" className="btn btn-ghost" title="Add project" onClick={addProject}>
            ▢
          </button>
          <ConfirmButton onConfirm={remove} title="Delete domain" />
        </span>
      </div>
      {isOpen && (
        <ul className="tree-list tree-children" role="group">
          {childIds.map((cid) => (
            <DomainNode
              key={cid}
              id={cid}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onExpand={onExpand}
            />
          ))}
          {projectIds.map((pid) => (
            <ProjectNode key={pid} id={pid} depth={depth + 1} expanded={expanded} onToggle={onToggle} onExpand={onExpand} />
          ))}
        </ul>
      )}
    </li>
  );
}

interface ProjectNodeProps extends NodeSharedProps {
  id: string;
  depth: number;
}

function ProjectNode({ id, depth, onExpand }: ProjectNodeProps): React.JSX.Element {
  const { store } = useDataLayer();
  const { selection, navigate } = useSelection();
  const project = useProjectReactive(store, id);
  const isSelected = selection.kind === 'project' && selection.id === id;
  if (!project) return <></>;

  function remove(): void {
    deleteProject(store, id);
    if (isSelected) navigate({ kind: 'home' });
  }

  return (
    <li className="tree-node" role="treeitem">
      <div
        className={`tree-row${isSelected ? ' tree-row-selected' : ''}`}
        style={{ paddingInlineStart: `${depth * 14}px` }}
      >
        <span className="tree-caret tree-caret-leaf" aria-hidden="true">•</span>
        <button
          type="button"
          className="tree-label"
          onClick={() => {
            onExpand(id);
            navigate({ kind: 'project', id });
          }}
        >
          <span className="tree-icon tree-icon-project" aria-hidden="true">▣</span>
          <span className="tree-name">{project.name || 'Untitled'}</span>
        </button>
        <span className="tree-actions">
          <ConfirmButton onConfirm={remove} title="Delete project" />
        </span>
      </div>
    </li>
  );
}

// --- small reactive helpers -----------------------------------------------

function useDomainReactive(store: MergeableStore, id: string): { name: string } | undefined {
  const row = useRow(TABLES.domains, id, store);
  if (!row || Object.keys(row).length === 0) return undefined;
  return { name: String(row[COLUMNS.domains.name] ?? '') };
}

function useProjectReactive(store: MergeableStore, id: string): { name: string } | undefined {
  const row = useRow(TABLES.projects, id, store);
  if (!row || Object.keys(row).length === 0) return undefined;
  return { name: String(row[COLUMNS.projects.name] ?? '') };
}

/**
 * Domain ids that should be expanded so `selection` is visible. For a
 * domain selection, that's its full ancestor chain. For a project/task/note
 * selection, it's the ancestor chain of the domain that owns the project.
 */
function expandedDomainIdsForSelection(store: MergeableStore, sel: Selection): Set<string> {
  const domainId = domainIdForSelection(store, sel);
  if (!domainId) return new Set();
  return new Set(getDomainPath(store, domainId).map((d) => d.id));
}

function domainIdForSelection(store: MergeableStore, sel: Selection): string | null {
  if (sel.kind === 'home' || sel.kind === 'note') return null;
  if (sel.kind === 'domain') return sel.id;
  if (sel.kind === 'project') {
    return getProject(store, sel.id)?.domainId ?? null;
  }
  // task: walk up to the root task, then its project's domain.
  const task = getTask(store, sel.id);
  if (!task) return null;
  let root = task;
  const seen = new Set<string>();
  while (root.parentTaskId && !seen.has(root.id)) {
    seen.add(root.id);
    const parent = getTask(store, root.parentTaskId);
    if (!parent) break;
    root = parent;
  }
  return root.projectId ? (getProject(store, root.projectId)?.domainId ?? null) : null;
}