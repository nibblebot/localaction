import { useDataLayer, useStoreVersion } from '../data/index.ts';
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
  trail: BreadcrumbSegment[];
  focus: Selection | null;
}

function domainTrail(
  store: ReturnType<typeof useDataLayer>['store'],
  id: string,
): BreadcrumbSegment[] {
  return getDomainPath(store, id).map((d) => ({
    selection: { kind: 'domain', id: d.id },
    label: d.name || 'Untitled',
  }));
}

export function useResolvedSelection(sel: Selection): ResolvedSelection {
  const { store } = useDataLayer();
  useStoreVersion(store);

  if (sel.kind === 'home') {
    return { trail: [], focus: sel };
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

  if (sel.kind === 'tag') {
    return { trail: [], focus: sel };
  }


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

function entityTrail(
  store: ReturnType<typeof useDataLayer>['store'],
  sel: Selection,
): BreadcrumbSegment[] {
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