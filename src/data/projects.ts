import { useRow, useRowIds } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES } from './schema.ts';
import { newId, nowIso, normalizeRelation, row } from './internal.ts';
import type { Project, ProjectInput, ProjectPatch } from './types.ts';

export function createProject(
  store: MergeableStore,
  input: ProjectInput,
): string {
  const id = newId();
  const ts = nowIso();
  store.setRow(
    TABLES.projects,
    id,
    row({
      [COLUMNS.projects.name]: input.name,
      [COLUMNS.projects.domainId]: input.domainId,
      [COLUMNS.projects.createdAt]: ts,
      [COLUMNS.projects.updatedAt]: ts,
    }),
  );
  return id;
}

export function updateProject(
  store: MergeableStore,
  id: string,
  patch: ProjectPatch,
): void {
  if (!store.hasRow(TABLES.projects, id)) return;
  const next: Record<string, string | undefined> = {
    [COLUMNS.projects.updatedAt]: nowIso(),
  };
  if (patch.name !== undefined) next[COLUMNS.projects.name] = patch.name;
  if (patch.domainId === null) {
    store.delCell(TABLES.projects, id, COLUMNS.projects.domainId);
  } else if (patch.domainId !== undefined) {
    next[COLUMNS.projects.domainId] = patch.domainId;
  }
  store.setPartialRow(TABLES.projects, id, row(next));
}

export function deleteProject(store: MergeableStore, id: string): void {
  store.delRow(TABLES.projects, id);
}

export function getProject(store: MergeableStore, id: string): Project | undefined {
  const row = store.getRow(TABLES.projects, id);
  if (!row || Object.keys(row).length === 0) return undefined;
  return {
    id,
    name: String(row[COLUMNS.projects.name] ?? ''),
    domainId: normalizeRelation(row[COLUMNS.projects.domainId]),
    createdAt: String(row[COLUMNS.projects.createdAt] ?? ''),
    updatedAt: String(row[COLUMNS.projects.updatedAt] ?? ''),
  };
}

export function getProjectsForDomain(store: MergeableStore, domainId: string): string[] {
  return store
    .getRowIds(TABLES.projects)
    .filter((id) => store.getCell(TABLES.projects, id, COLUMNS.projects.domainId) === domainId);
}

export function getOrphanedProjectIds(store: MergeableStore): string[] {
  return store.getRowIds(TABLES.projects).filter((id) => {
    const domain = normalizeRelation(store.getCell(TABLES.projects, id, COLUMNS.projects.domainId));
    return domain !== null && !store.hasRow(TABLES.domains, domain);
  });
}

export function isProjectOrphaned(store: MergeableStore, id: string): boolean {
  const domain = normalizeRelation(store.getCell(TABLES.projects, id, COLUMNS.projects.domainId));
  return domain !== null && !store.hasRow(TABLES.domains, domain);
}


export function useProjects(store: MergeableStore, domainId: string): string[] {
  const allIds = useRowIds(TABLES.projects, store);
  return allIds.filter(
    (id) => store.getCell(TABLES.projects, id, COLUMNS.projects.domainId) === domainId,
  );
}

export function useProject(store: MergeableStore, id: string | undefined): Project | undefined {
  const row = useRow(TABLES.projects, id ?? '', store);
  if (!id || !row || Object.keys(row).length === 0) return undefined;
  return {
    id,
    name: String(row[COLUMNS.projects.name] ?? ''),
    domainId: normalizeRelation(row[COLUMNS.projects.domainId]),
    createdAt: String(row[COLUMNS.projects.createdAt] ?? ''),
    updatedAt: String(row[COLUMNS.projects.updatedAt] ?? ''),
  };
}