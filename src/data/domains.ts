import { useRow } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES } from './schema.ts';
import { newId, nowIso, normalizeRelation, row } from './internal.ts';
import { isDomainColorId, type DomainColorId } from './colors.ts';
import type { Domain, DomainInput, DomainPatch } from './types.ts';

export function createDomain(
  store: MergeableStore,
  input: DomainInput,
): string {
  const id = newId();
  const ts = nowIso();
  const parentId = input.parentId ?? null;
  const color: DomainColorId = isDomainColorId(input.color)
    ? input.color
    : 'gray';
  store.setRow(
    TABLES.domains,
    id,
    row({
      [COLUMNS.domains.name]: input.name,
      [COLUMNS.domains.parentId]: parentId,
      [COLUMNS.domains.color]: color,
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
  if (patch.color !== undefined) {
    next[COLUMNS.domains.color] = isDomainColorId(patch.color)
      ? patch.color
      : 'gray';
  }
  store.setPartialRow(TABLES.domains, id, row(next));
}

export function deleteDomain(store: MergeableStore, id: string): void {
  store.delRow(TABLES.domains, id);
}

export function getDomain(store: MergeableStore, id: string): Domain | undefined {
  const row = store.getRow(TABLES.domains, id);
  if (!row || Object.keys(row).length === 0) return undefined;
  const rawColor: unknown = row[COLUMNS.domains.color];
  const color: DomainColorId = isDomainColorId(rawColor) ? rawColor : 'gray';
  return {
    id,
    name: String(row[COLUMNS.domains.name] ?? ''),
    parentId: normalizeRelation(row[COLUMNS.domains.parentId]),
    color,
    createdAt: String(row[COLUMNS.domains.createdAt] ?? ''),
    updatedAt: String(row[COLUMNS.domains.updatedAt] ?? ''),
  };
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

export function useDomain(store: MergeableStore, id: string | undefined): Domain | undefined {
  const row = useRow(TABLES.domains, id ?? '', store);
  if (!id || !row || Object.keys(row).length === 0) return undefined;
  const rawColor: unknown = row[COLUMNS.domains.color];
  const color: DomainColorId = isDomainColorId(rawColor) ? rawColor : 'gray';
  return {
    id,
    name: String(row[COLUMNS.domains.name] ?? ''),
    parentId: normalizeRelation(row[COLUMNS.domains.parentId]),
    color,
    createdAt: String(row[COLUMNS.domains.createdAt] ?? ''),
    updatedAt: String(row[COLUMNS.domains.updatedAt] ?? ''),
  };
}
