/**
 * Resolve the current selection into a clickable breadcrumb trail and the
 * "focus" selection the right pane should render (entity editor / note).
 *
 * The trail is a list of `Selection`s from the topmost reachable ancestor
 * down to the selected entity (or its note). The `Breadcrumbs` component
 * prepends a "Home" entry. Each entry is independently navigable.
 *
 * Reactivity: we subscribe to the store's full tables snapshot
 * (`useTables`) so renames / moves / deletes anywhere along the chain
 * refresh the trail. This is a blunt subscription, but the trail is a tiny
 * piece of DOM and phase 0 is a single-user personal app — correctness and
 * freshness win over micro-optimising re-renders here.
 */

import { useTables } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { useDataLayer } from '../data/index.ts';
import {
  getDomain,
  getDomainPath,
  getProject,
  getTask,
  getNoteBySlug,
} from '../data/index.ts';
import type { Selection } from '../router.ts';

export interface BreadcrumbSegment {
  selection: Selection;
  label: string;
}

export interface ResolvedSelection {
  /** Clickable trail, root-first, excluding the leading "Home". */
  trail: BreadcrumbSegment[];
  /**
   * What the right pane should render. `null` when the selection points at
   * a missing entity (e.g. a stale deep link) — the pane shows an empty
   * state and the trail is empty.
   */
  focus: Selection | null;
}

function useStoreTick(store: MergeableStore): void {
  // Subscribe to the tables snapshot purely for its re-render side effect.
  useTables(store);
}

/** Resolve the domain ancestry for a domain id into breadcrumb segments. */
function domainTrail(store: MergeableStore, id: string): BreadcrumbSegment[] {
  return getDomainPath(store, id).map((d) => ({
    selection: { kind: 'domain', id: d.id },
    label: d.name || 'Untitled',
  }));
}

export function useResolvedSelection(sel: Selection): ResolvedSelection {
  const { store } = useDataLayer();
  useStoreTick(store);

  if (sel.kind === 'home') {
    return { trail: [], focus: null };
  }

  if (sel.kind === 'domain') {
    const domain = getDomain(store, sel.id);
    if (!domain) return { trail: [], focus: null };
    return {
      trail: domainTrail(store, sel.id),
      focus: sel,
    };
  }

  if (sel.kind === 'project') {
    const project = getProject(store, sel.id);
    if (!project) return { trail: [], focus: null };
    const trail: BreadcrumbSegment[] = project.domainId
      ? domainTrail(store, project.domainId)
      : [];
    trail.push({
      selection: { kind: 'project', id: project.id },
      label: project.name || 'Untitled',
    });
    return { trail, focus: sel };
  }

  if (sel.kind === 'task') {
    const task = getTask(store, sel.id);
    if (!task) return { trail: [], focus: null };
    // Walk parentTaskId up to the root task, root-first.
    const chain: BreadcrumbSegment[] = [];
    let cur: string | null = task.id;
    const seen = new Set<string>();
    const ancestors: typeof task[] = [];
    while (cur && !seen.has(cur)) {
      const t = getTask(store, cur);
      if (!t) break;
      seen.add(cur);
      ancestors.unshift(t);
      cur = t.parentTaskId;
    }
    const root = ancestors[0];
    const trail: BreadcrumbSegment[] = [];
    if (root?.projectId) {
      const project = getProject(store, root.projectId);
      if (project) {
        if (project.domainId) trail.push(...domainTrail(store, project.domainId));
        trail.push({
          selection: { kind: 'project', id: project.id },
          label: project.name || 'Untitled',
        });
      }
    }
    for (const t of ancestors) {
      chain.push({ selection: { kind: 'task', id: t.id }, label: t.title || 'Untitled' });
    }
    return { trail: [...trail, ...chain], focus: sel };
  }

  // note
  const note = getNoteBySlug(store, sel.slug);
  if (!note) return { trail: [], focus: null };
  const entitySel: Selection =
    note.entityType === 'domain'
      ? { kind: 'domain', id: note.entityId! }
      : note.entityType === 'project'
        ? { kind: 'project', id: note.entityId! }
        : { kind: 'task', id: note.entityId! };
  const base = entityTrail(store, entitySel);
  return {
    trail: [
      ...base,
      { selection: { kind: 'note', slug: note.slug }, label: note.title || 'Untitled' },
    ],
    focus: sel,
  };
}

/** Trail for a non-note entity selection (no store tick — caller ticks). */
function entityTrail(store: MergeableStore, sel: Selection): BreadcrumbSegment[] {
  if (sel.kind === 'domain') return domainTrail(store, sel.id);
  if (sel.kind === 'project') {
    const project = getProject(store, sel.id);
    if (!project) return [];
    const trail: BreadcrumbSegment[] = project.domainId
      ? domainTrail(store, project.domainId)
      : [];
    trail.push({ selection: { kind: 'project', id: project.id }, label: project.name || 'Untitled' });
    return trail;
  }
  if (sel.kind === 'task') {
    const task = getTask(store, sel.id);
    if (!task) return [];
    const ancestors: typeof task[] = [];
    let cur: string | null = task.id;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      const t = getTask(store, cur);
      if (!t) break;
      seen.add(cur);
      ancestors.unshift(t);
      cur = t.parentTaskId;
    }
    const root = ancestors[0];
    const trail: BreadcrumbSegment[] = [];
    if (root?.projectId) {
      const project = getProject(store, root.projectId);
      if (project) {
        if (project.domainId) trail.push(...domainTrail(store, project.domainId));
        trail.push({ selection: { kind: 'project', id: project.id }, label: project.name || 'Untitled' });
      }
    }
    for (const t of ancestors) {
      trail.push({ selection: { kind: 'task', id: t.id }, label: t.title || 'Untitled' });
    }
    return trail;
  }
  return [];
}