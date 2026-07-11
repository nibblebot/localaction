import { useRow } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES } from './schema.ts';
import { newId, nowIso, normalizeRelation, row } from './internal.ts';
import type { Project, ProjectInput, ProjectPatch } from './types.ts';
import { readSiblingOrders } from './order.ts';

function nextOrder(store: MergeableStore, domainId: string | null): number {
  const siblings = readSiblingOrders(store, TABLES.projects, COLUMNS.projects.domainId, domainId);
  const last = siblings[siblings.length - 1];
  if (!last) return 1000;
  return last.order + 1000;
}

export function createProject(
  store: MergeableStore,
  input: ProjectInput,
): string {
  const id = newId();
  const ts = nowIso();
  const order = nextOrder(store, input.domainId);
  store.setRow(
    TABLES.projects,
    id,
    row({
      [COLUMNS.projects.name]: input.name,
      [COLUMNS.projects.domainId]: input.domainId,
      [COLUMNS.projects.order]: order,
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
  const next: Record<string, string | number | null | undefined> = {
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

export function useProject(store: MergeableStore, id: string | undefined): Project | undefined {
  const row = useRow(TABLES.projects, id ?? '', store);
  if (!id || !row || Object.keys(row).length === 0) return undefined;
  return {
    id,
    name: String(row[COLUMNS.projects.name] ?? ''),
    domainId: normalizeRelation(row[COLUMNS.projects.domainId]),
    order: Number(row[COLUMNS.projects.order] ?? 0),
    createdAt: String(row[COLUMNS.projects.createdAt] ?? ''),
    updatedAt: String(row[COLUMNS.projects.updatedAt] ?? ''),
  };
}
