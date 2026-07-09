import { useRow, useRowIds } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES } from './schema.ts';
import { newId, nowIso, normalizeRelation, row } from './internal.ts';
import type { Domain, DomainInput, DomainPatch } from './types.ts';

export function createDomain(
  store: MergeableStore,
  input: DomainInput,
): string {

  const id = newId();
  const ts = nowIso();
  const parentId = input.parentId ?? null;
  store.setRow(
    TABLES.domains,
    id,
    row({
      [COLUMNS.domains.name]: input.name,
      [COLUMNS.domains.parentId]: parentId,
      [COLUMNS.domains.createdAt]: ts,
      [COLUMNS.domains.updatedAt]: ts,
    }),
  );
  return id;
}

export function updateDomain(
  store: MergeableStore,
  id: string,
  patch: DomainPatch,
): void {
  if (!store.hasRow(TABLES.domains, id)) return;
  const next: Record<string, string | undefined> = {
    [COLUMNS.domains.updatedAt]: nowIso(),
  };
  if (patch.name !== undefined) next[COLUMNS.domains.name] = patch.name;
  if (patch.parentId === null) {
    store.delCell(TABLES.domains, id, COLUMNS.domains.parentId);
  } else if (patch.parentId !== undefined) {
    next[COLUMNS.domains.parentId] = patch.parentId;
  }
  store.setPartialRow(TABLES.domains, id, row(next));
}

export function deleteDomain(store: MergeableStore, id: string): void {
  store.delRow(TABLES.domains, id);
}

export function getDomain(store: MergeableStore, id: string): Domain | undefined {
  const row = store.getRow(TABLES.domains, id);
  if (!row || Object.keys(row).length === 0) return undefined;
  return {
    id,
    name: String(row[COLUMNS.domains.name] ?? ''),
    parentId: normalizeRelation(row[COLUMNS.domains.parentId]),
    createdAt: String(row[COLUMNS.domains.createdAt] ?? ''),
    updatedAt: String(row[COLUMNS.domains.updatedAt] ?? ''),
  };
}

export function getDomainPath(store: MergeableStore, id: string): Domain[] {
  const out: Domain[] = [];
  let current: string | undefined = id;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    const domain = getDomain(store, current);
    if (!domain) break;
    seen.add(current);
    out.unshift(domain);
    current = domain.parentId ?? undefined;
  }
  return out;
}

export function getAllDomainIds(store: MergeableStore): string[] {
  return store.getRowIds(TABLES.domains);
}

export function getTopLevelDomainIds(store: MergeableStore): string[] {
  return store
    .getRowIds(TABLES.domains)
    .filter((id) => normalizeRelation(store.getCell(TABLES.domains, id, COLUMNS.domains.parentId)) === null);
}
export function getChildDomainIds(store: MergeableStore, parentId: string): string[] {
  return store
    .getRowIds(TABLES.domains)
    .filter((id) => store.getCell(TABLES.domains, id, COLUMNS.domains.parentId) === parentId);
}

export function getAllDomainIdsFlat(store: MergeableStore): string[] {
  const out: string[] = [];
  const walk = (parentId: string | null): void => {
    for (const cid of store.getRowIds(TABLES.domains)) {
      const p = normalizeRelation(store.getCell(TABLES.domains, cid, COLUMNS.domains.parentId));
      if (p === parentId) {
        out.push(cid);
        walk(cid);
      }
    }
  };
  walk(null);
  return out;
}

export function getOrphanedDomainIds(store: MergeableStore): string[] {
  return store.getRowIds(TABLES.domains).filter((id) => {
    const parent = normalizeRelation(store.getCell(TABLES.domains, id, COLUMNS.domains.parentId));
    return parent !== null && !store.hasRow(TABLES.domains, parent);
  });
}

export function useOrphanedDomainIds(store: MergeableStore): string[] {
  useRowIds(TABLES.domains, store);
  return getOrphanedDomainIds(store);
}


export function useDomains(store: MergeableStore): string[] {
  const allIds = useRowIds(TABLES.domains, store);
  return allIds.filter(
    (id) => store.getCell(TABLES.domains, id, COLUMNS.domains.parentId) === undefined,
  );
}

export function useChildDomains(store: MergeableStore, parentId: string): string[] {
  const allIds = useRowIds(TABLES.domains, store);
  return allIds.filter(
    (id) => store.getCell(TABLES.domains, id, COLUMNS.domains.parentId) === parentId,
  );
}

export function useDomain(store: MergeableStore, id: string | undefined): Domain | undefined {
  const row = useRow(TABLES.domains, id ?? '', store);

  if (!id || !row || Object.keys(row).length === 0) return undefined;
  return {
    id,
    name: String(row[COLUMNS.domains.name] ?? ''),
    parentId: normalizeRelation(row[COLUMNS.domains.parentId]),
    createdAt: String(row[COLUMNS.domains.createdAt] ?? ''),
    updatedAt: String(row[COLUMNS.domains.updatedAt] ?? ''),
  };
}