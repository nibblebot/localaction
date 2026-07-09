import { useMemo, useState } from 'react';
import type { MergeableStore } from 'tinybase';
import {
  useDataLayer,
  useDomains,
  useProjects,
  useOrphanedDomainIds,
  useStoreVersion,
  useAllTagCounts,
  createDomain,
  getChildDomainIds,
} from '../data/index.ts';
import type { TagCount } from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import PromptModal from './PromptModal.tsx';
import SyncStatusBadge from './SyncStatusBadge.tsx';


interface FlatDomain {
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
  isOrphan: boolean;
  children: FlatDomain[];
}

export default function Sidebar(): React.JSX.Element {
  const { store } = useDataLayer();
  const rootIds = useDomains(store);
  const orphanIds = useOrphanedDomainIds(store);
  useStoreVersion(store);

  const { navigate } = useSelection();
  // Hoist tag subscription to the always-mounted parent so the subscription
  // survives even when no tags are present yet — otherwise adding the first
  const tagCounts = useAllTagCounts(store);
  const [query, setQuery] = useState('');
  type PromptContext =
    | { kind: 'top' }
    | { kind: 'sub'; parentId: string };
  const [promptCtx, setPromptCtx] = useState<PromptContext | null>(null);

  function openPrompt(ctx: PromptContext): void {
    setPromptCtx(ctx);
  }
  function closePrompt(): void {
    setPromptCtx(null);
  }
  function createWithName(name: string): void {
    if (!promptCtx) return;
    const parentId = promptCtx.kind === 'sub' ? promptCtx.parentId : null;
    const id = createDomain(store, { name, parentId });
    setPromptCtx(null);
    navigate({ kind: 'domain', id });
  }
  const flat = useMemo<FlatDomain[]>(() => {
    const byId = new Map<string, FlatDomain>();
    const visit = (
      id: string,
      depth: number,
      parentId: string | null,
    ): FlatDomain => {
      const node: FlatDomain = {
        id,
        name: getName(store, id),
        depth,
        parentId,
        isOrphan: false,
        children: [],
      };
      byId.set(id, node);
      const childIds = getChildDomainIds(store, id);
      for (const cid of childIds) {
        node.children.push(visit(cid, depth + 1, id));
      }
      return node;
    };
    const roots: FlatDomain[] = [];
    for (const id of rootIds) roots.push(visit(id, 0, null));
    if (orphanIds.length) {
      for (const id of orphanIds) {
        if (byId.has(id)) continue;
        roots.push(visit(id, 0, null));
        const node = byId.get(id)!;
        node.isOrphan = true;
      }
    }
    return roots;
  }, [store, rootIds, orphanIds]);
  const q = query.trim().toLowerCase();
  const visible = filterTree(flat, q);

  return (
    <aside className="sidebar" aria-label="Sidebar">
      <div className="sidebar-section sidebar-app-name-row">
        <h1 className="sidebar-app-name">LocalAction</h1>
        <SyncStatusBadge />
      </div>

      <div className="sidebar-section">
        <div className="sidebar-search">
          <svg className="sidebar-search-icon" aria-hidden="true">
            <use href="/icons.svg#search-icon" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search"
          />
          {query && (
            <button
              type="button"
              className="sidebar-search-clear"
              aria-label="Clear search"
              onClick={() => setQuery('')}
            >
              <svg className="svg-icon" aria-hidden="true">
                <use href="/icons.svg#close-icon" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-section" style={{ flex: '1 1 auto', overflow: 'auto' }}>
        <h2 className="sidebar-section-title">
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#tag-icon" />
          </svg>
          Domains
          <button
            type="button"
            className="sidebar-section-title-action"
            onClick={() => openPrompt({ kind: 'top' })}
            aria-label="New domain"
            title="New domain"
          >
            <svg className="svg-icon" aria-hidden="true">
              <use href="/icons.svg#add-icon" />
            </svg>
          </button>
        </h2>
        {visible.length === 0 ? (
          <p className="sidebar-empty">
            {q ? 'No matches.' : 'No domains yet. Create one to get started.'}
          </p>
        ) : (
          <ul className="sidebar-section-body" role="list">
            {visible.map((d) => (
              <DomainTreeItem
                key={d.id}
                domain={d}
                onAddSubdomain={(parentId) => openPrompt({ kind: 'sub', parentId })}
              />
            ))}
          </ul>
        )}
      </div>

      {tagCounts.length > 0 && <TagsSection tags={tagCounts} />}
      <PromptModal
        open={promptCtx !== null}
        title="New domain"
        label="Name"
        placeholder="e.g. Work, Personal, Side project"
        submitLabel="Create"
        onSubmit={createWithName}
        onCancel={closePrompt}
      />
    </aside>
  );
}

function getName(store: MergeableStore, id: string): string {
  const v = store.getCell('domains', id, 'name');
  const name = typeof v === 'string' ? v : '';
  return name || 'Untitled';
}

function filterTree(nodes: FlatDomain[], q: string): FlatDomain[] {
  if (!q) return nodes;
  const out: FlatDomain[] = [];
  for (const node of nodes) {
    const filteredChildren = filterTree(node.children, q);
    if (node.name.toLowerCase().includes(q) || filteredChildren.length > 0) {
      out.push({ ...node, children: filteredChildren });
    }
  }
  return out;
}

function DomainTreeItem({
  domain,
  onAddSubdomain,
}: {
  domain: FlatDomain;
  onAddSubdomain: (parentId: string) => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { selection, navigate } = useSelection();
  useStoreVersion(store);
  const projectIds = useProjects(store, domain.id);
  const isOpen = selection.kind === 'domain' && selection.id === domain.id;
  const isActive = isOpen;

  return (
    <li>
      <div className="sidebar-item-row">
        <button
          type="button"
          className={`sidebar-item${isActive ? ' sidebar-item-active' : ''}${domain.depth === 0 ? ' sidebar-item-top' : ''}`}
          style={{ paddingInlineStart: `${8 + domain.depth * 12}px` }}
          onClick={() => navigate({ kind: 'domain', id: domain.id })}
        >
          <span className="sidebar-item-name">{domain.name}</span>
          {projectIds.length > 0 && (
            <span className="sidebar-link-count">{projectIds.length}</span>
          )}
        </button>
        <button
          type="button"
          className="sidebar-item-action"
          onClick={(e) => {
            e.stopPropagation();
            onAddSubdomain(domain.id);
          }}
          aria-label={`Add sub-domain to ${domain.name || 'domain'}`}
          title="Add sub-domain"
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#add-icon" />
          </svg>
        </button>
      </div>
      {domain.children.length > 0 && (
        <ul className="sidebar-domain-children" role="list">
          {domain.children.map((child) => (
            <DomainTreeItem
              key={child.id}
              domain={child}
              onAddSubdomain={onAddSubdomain}
            />
          ))}
        </ul>
      )}
      {isOpen && projectIds.length > 0 && (
        <ul className="sidebar-item-children" role="list">
          {projectIds.map((pid) => (
            <li key={pid}>
              <ProjectShortcut id={pid} depth={domain.depth + 1} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ProjectShortcut({ id, depth }: { id: string; depth: number }): React.JSX.Element {
  const { store } = useDataLayer();
  const { selection, navigate } = useSelection();
  useStoreVersion(store);
  const v = store.getCell('projects', id, 'name');
  const name = (typeof v === 'string' ? v : '') || 'Untitled';
  const isActive = selection.kind === 'project' && selection.id === id;
  return (
    <button
      type="button"
      className={`sidebar-item${isActive ? ' sidebar-item-active' : ''}`}
      style={{ paddingInlineStart: `${8 + depth * 12}px` }}
      onClick={() => navigate({ kind: 'project', id })}
    >
      <svg className="svg-icon" aria-hidden="true">
        <use href="/icons.svg#project-icon" />
      </svg>
      <span className="sidebar-item-name">{name}</span>
    </button>
  );
}

function TagsSection({ tags }: { tags: TagCount[] }): React.JSX.Element {
  const { selection, navigate } = useSelection();
  return (
    <div className="sidebar-section">
      <h2 className="sidebar-section-title">
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#tag-icon" />
        </svg>
        Tags
      </h2>
      <ul className="sidebar-section-body" role="list">
        {tags.map((t) => {
          const active = selection.kind === 'tag' && selection.value === t.tag;
          return (
            <li key={t.tag}>
              <button
                type="button"
                className={`sidebar-link${active ? ' sidebar-link-active' : ''}`}
                onClick={() => navigate({ kind: 'tag', value: t.tag })}
              >
                <svg className="svg-icon" aria-hidden="true">
                  <use href="/icons.svg#tag-icon" />
                </svg>
                <span>#{t.tag}</span>
                <span className="sidebar-link-count">{t.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
