import type { MergeableStore } from 'tinybase';
import { useRowIds, useTables } from 'tinybase/ui-react';
import { COLUMNS, TABLES, TASK_STATUS } from './schema.ts';
import { getDomain, getAllDomainIdsFlat } from './domains.ts';
import type { Domain } from './types.ts';

export interface DomainCount {
  id: string;
  name: string;
  parentId: string | null;
  color: Domain['color'];
  order: number;
  childCount: number;
  projectCount: number;
  taskCount: number;
  noteCount: number;
}

/**
 * `version` is a dependency token that React Compiler's optimizer
 * recognises as "used" by the body. Without it, the compiler inlines
 * `getDomainCounts` and elides the actual function call (returning only
 * the cached `useRowIds` results). The token has no semantic value —
 * its sole purpose is to keep the subscription hooks alive.
 */
export function getDomainCounts(store: MergeableStore, _version = 0, _tables?: unknown): DomainCount[] {
  const projectIds = store.getRowIds(TABLES.projects);
  const taskIds = store.getRowIds(TABLES.tasks);
  const noteIds = store.getRowIds(TABLES.notes);

  const projectDomain = new Map<string, string | null>();
  for (const pid of projectIds) {
    projectDomain.set(
      pid,
      typeof store.getCell(TABLES.projects, pid, COLUMNS.projects.domainId) === 'string'
        ? String(store.getCell(TABLES.projects, pid, COLUMNS.projects.domainId))
        : null,
    );
  }
  const taskProject = new Map<string, string | null>();
  for (const tid of taskIds) {
    taskProject.set(
      tid,
      typeof store.getCell(TABLES.tasks, tid, COLUMNS.tasks.projectId) === 'string'
        ? String(store.getCell(TABLES.tasks, tid, COLUMNS.tasks.projectId))
        : null,
    );
  }

  const allDomainIds = getAllDomainIdsFlat(store);
  const descendantsOf = new Map<string, Set<string>>();
  for (const did of allDomainIds) {
    const set = new Set<string>([did]);
    let cur: string | null = did;
    while (cur) {
      const d = getDomain(store, cur);
      if (!d || d.parentId == null) break;
      set.add(d.parentId);
      cur = d.parentId;
    }
    descendantsOf.set(did, set);
  }

  const directSubDomainCount = new Map<string, number>();
  const directProjectCount = new Map<string, number>();
  for (const did of allDomainIds) {
    directSubDomainCount.set(did, 0);
    directProjectCount.set(did, 0);
  }
  for (const id of allDomainIds) {
    const parent = store.getCell(TABLES.domains, id, COLUMNS.domains.parentId);
    if (typeof parent === 'string') {
      directSubDomainCount.set(parent, (directSubDomainCount.get(parent) ?? 0) + 1);
    }
  }
  for (const pid of projectIds) {
    const dId = projectDomain.get(pid) ?? null;
    if (!dId) continue;
    directProjectCount.set(dId, (directProjectCount.get(dId) ?? 0) + 1);
  }

  const projectCount = new Map<string, number>();
  const taskCount = new Map<string, number>();
  const noteCount = new Map<string, number>();
  for (const did of allDomainIds) {
    projectCount.set(did, 0);
    taskCount.set(did, 0);
    noteCount.set(did, 0);
  }

  for (const pid of projectIds) {
    const dId = projectDomain.get(pid) ?? null;
    if (!dId) continue;
    for (const owner of descendantsOf.get(dId) ?? []) {
      projectCount.set(owner, (projectCount.get(owner) ?? 0) + 1);
    }
  }
  for (const tid of taskIds) {
    const pId = taskProject.get(tid) ?? null;
    if (!pId) continue;
    const dId = projectDomain.get(pId) ?? null;
    if (!dId) continue;
    for (const owner of descendantsOf.get(dId) ?? []) {
      taskCount.set(owner, (taskCount.get(owner) ?? 0) + 1);
    }
  }
  for (const nid of noteIds) {
    const type = String(store.getCell(TABLES.notes, nid, COLUMNS.notes.entityType) ?? '');
    if (type !== 'domain') continue;
    const eId =
      typeof store.getCell(TABLES.notes, nid, COLUMNS.notes.entityId) === 'string'
        ? String(store.getCell(TABLES.notes, nid, COLUMNS.notes.entityId))
        : null;
    if (!eId) continue;
    if (!descendantsOf.has(eId)) continue;
    for (const owner of descendantsOf.get(eId) ?? []) {
      noteCount.set(owner, (noteCount.get(owner) ?? 0) + 1);
    }
  }

  return allDomainIds.map((did) => {
    const d = getDomain(store, did);
    return {
      id: did,
      name: d?.name ?? '',
      parentId: d?.parentId ?? null,
      color: d?.color ?? 'gray',
      order: d?.order ?? 0,
      childCount:
        (directSubDomainCount.get(did) ?? 0) + (directProjectCount.get(did) ?? 0),
      projectCount: projectCount.get(did) ?? 0,
      taskCount: taskCount.get(did) ?? 0,
      noteCount: noteCount.get(did) ?? 0,
    };
  });
}

export function useDomainCounts(store: MergeableStore): DomainCount[] {
  // Subscribe via useRowIds (length changes) and useTables (cell changes).
  // Both feed the cache key the React Compiler uses to decide whether
  // to re-run the body; without useTables, a row whose `order` cell
  // changes (e.g. via `reorderDomain`) does not invalidate the memoised
  // result, so the sidebar tree keeps showing the stale order.
  const d = useRowIds(TABLES.domains, store);
  const p = useRowIds(TABLES.projects, store);
  const t = useRowIds(TABLES.tasks, store);
  const n = useRowIds(TABLES.notes, store);
  const tables = useTables(store);
  return getDomainCounts(store, d.length + p.length + t.length + n.length, tables);
}

export function getNotesForDomainTree(
  store: MergeableStore,
  domainId: string,
  _version = 0,
  _tables?: unknown,
): { domainNotes: string[]; projectNotes: string[]; taskNotes: string[] } {
  const descendants = new Set<string>([domainId]);
  let added = true;
  while (added) {
    added = false;
    for (const id of store.getRowIds(TABLES.domains)) {
      const parent = store.getCell(TABLES.domains, id, COLUMNS.domains.parentId);
      if (typeof parent === 'string' && descendants.has(parent) && !descendants.has(id)) {
        descendants.add(id);
        added = true;
      }
    }
  }

  const domainNotes: string[] = [];
  const projectNotes: string[] = [];
  const taskNotes: string[] = [];
  for (const nid of store.getRowIds(TABLES.notes)) {
    const type = String(store.getCell(TABLES.notes, nid, COLUMNS.notes.entityType) ?? '');
    const eId = store.getCell(TABLES.notes, nid, COLUMNS.notes.entityId);
    if (typeof eId !== 'string') continue;
    if (type === 'domain' && descendants.has(eId)) {
      domainNotes.push(nid);
    } else if (type === 'project') {
      const pDomain = store.getCell(TABLES.projects, eId, COLUMNS.projects.domainId);
      if (typeof pDomain === 'string' && descendants.has(pDomain)) {
        projectNotes.push(nid);
      }
    } else if (type === 'task') {
      const pId = store.getCell(TABLES.tasks, eId, COLUMNS.tasks.projectId);
      if (typeof pId !== 'string') continue;
      const pDomain = store.getCell(TABLES.projects, pId, COLUMNS.projects.domainId);
      if (typeof pDomain === 'string' && descendants.has(pDomain)) {
        taskNotes.push(nid);
      }
    }
  }
  return { domainNotes, projectNotes, taskNotes };
}

export function useNotesForDomainTree(
  store: MergeableStore,
  domainId: string,
): { domainNotes: string[]; projectNotes: string[]; taskNotes: string[] } {
  const d = useRowIds(TABLES.domains, store);
  const p = useRowIds(TABLES.projects, store);
  const t = useRowIds(TABLES.tasks, store);
  const n = useRowIds(TABLES.notes, store);
  const tables = useTables(store);
  return getNotesForDomainTree(store, domainId, d.length + p.length + t.length + n.length, tables);
}

export interface ProjectRollup {
  projectId: string;
  domainId: string | null;
  projectName: string;
  order: number;
  done: number;
  total: number;
}

export function useProjectRollups(store: MergeableStore): ProjectRollup[] {
  const p = useRowIds(TABLES.projects, store);
  const t = useRowIds(TABLES.tasks, store);
  const tables = useTables(store);
  return getProjectRollups(store, p.length + t.length, tables);
}

export function getProjectRollups(
  store: MergeableStore,
  _version = 0,
  _tables?: unknown,
): ProjectRollup[] {
  const projectIds = store.getRowIds(TABLES.projects);
  const projectDomain = new Map<string, string | null>();
  for (const pid of projectIds) {
    projectDomain.set(
      pid,
      typeof store.getCell(TABLES.projects, pid, COLUMNS.projects.domainId) === 'string'
        ? String(store.getCell(TABLES.projects, pid, COLUMNS.projects.domainId))
        : null,
    );
  }
  const projectRollups: ProjectRollup[] = [];
  for (const pid of projectIds) {
    const domainIdRaw = store.getCell(TABLES.projects, pid, COLUMNS.projects.domainId);
    const domainId = typeof domainIdRaw === 'string' ? domainIdRaw : null;
    const name = String(store.getCell(TABLES.projects, pid, COLUMNS.projects.name) ?? '');
    const order = Number(store.getCell(TABLES.projects, pid, COLUMNS.projects.order) ?? 0);
    let done = 0;
    let total = 0;
    for (const tid of store.getRowIds(TABLES.tasks)) {
      if (store.getCell(TABLES.tasks, tid, COLUMNS.tasks.projectId) !== pid) continue;
      total += 1;
      if (store.getCell(TABLES.tasks, tid, COLUMNS.tasks.status) === TASK_STATUS.done) {
        done += 1;
      }
    }
    projectRollups.push({ projectId: pid, domainId, projectName: name, order, done, total });
  }
  return projectRollups;
}
