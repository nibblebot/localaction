import { useRow } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES } from './schema.ts';
import { newId, nowIso, normalizeRelation, row } from './internal.ts';
import { isAreaColorId, type AreaColorId } from './colors.ts';
import type { Area, AreaInput, AreaPatch } from './types.ts';
import { readSiblingOrders } from './order.ts';

function nextOrder(store: MergeableStore, parentId: string | null): number {
  const siblings = readSiblingOrders(store, TABLES.areas, COLUMNS.areas.parentId, parentId);
  const last = siblings[siblings.length - 1];
  if (!last) return 1000;
  return last.order + 1000;
}

export function createArea(
  store: MergeableStore,
  input: AreaInput,
): string {
  const id = newId();
  const ts = nowIso();
  const parentId = input.parentId ?? null;
  const color: AreaColorId = isAreaColorId(input.color)
    ? input.color
    : 'gray';
  const order = nextOrder(store, parentId);
  store.setRow(
    TABLES.areas,
    id,
    row({
      [COLUMNS.areas.name]: input.name,
      [COLUMNS.areas.parentId]: parentId,
      [COLUMNS.areas.color]: color,
      [COLUMNS.areas.order]: order,
      [COLUMNS.areas.createdAt]: ts,
      [COLUMNS.areas.updatedAt]: ts,
    }),
  );
  return id;
}

export function updateArea(
  store: MergeableStore,
  id: string,
  patch: AreaPatch,
): void {
  if (!store.hasRow(TABLES.areas, id)) return;
  const next: Record<string, string | number | null | undefined> = {
    [COLUMNS.areas.updatedAt]: nowIso(),
  };
  if (patch.name !== undefined) next[COLUMNS.areas.name] = patch.name;
  if (patch.parentId === null) {
    store.delCell(TABLES.areas, id, COLUMNS.areas.parentId);
  } else if (patch.parentId !== undefined) {
    next[COLUMNS.areas.parentId] = patch.parentId;
  }
  if (patch.color !== undefined) {
    next[COLUMNS.areas.color] = isAreaColorId(patch.color)
      ? patch.color
      : 'gray';
  }
  store.setPartialRow(TABLES.areas, id, row(next));
}

/**
 * A area and its full transitive sub-area subtree (root first), via
 * `parentId`. Read-only walker used by cascade deletion.
 */
export function descendantAreaIds(store: MergeableStore, rootId: string): string[] {
  const out: string[] = [rootId];
  const walk = (parentId: string): void => {
    for (const cid of store.getRowIds(TABLES.areas)) {
      const p = normalizeRelation(store.getCell(TABLES.areas, cid, COLUMNS.areas.parentId));
      if (p === parentId) {
        out.push(cid);
        walk(cid);
      }
    }
  };
  walk(rootId);
  return out;
}

export function getArea(store: MergeableStore, id: string): Area | undefined {
  const row = store.getRow(TABLES.areas, id);
  if (!row || Object.keys(row).length === 0) return undefined;
  const rawColor: unknown = row[COLUMNS.areas.color];
  const color: AreaColorId = isAreaColorId(rawColor) ? rawColor : 'gray';
  return {
    id,
    name: String(row[COLUMNS.areas.name] ?? ''),
    parentId: normalizeRelation(row[COLUMNS.areas.parentId]),
    color,
    order: Number(row[COLUMNS.areas.order] ?? 0),
    createdAt: String(row[COLUMNS.areas.createdAt] ?? ''),
    updatedAt: String(row[COLUMNS.areas.updatedAt] ?? ''),
  };
}

export function getAllAreaIdsFlat(store: MergeableStore): string[] {
  const out: string[] = [];
  const walk = (parentId: string | null): void => {
    for (const cid of store.getRowIds(TABLES.areas)) {
      const p = normalizeRelation(store.getCell(TABLES.areas, cid, COLUMNS.areas.parentId));
      if (p === parentId) {
        out.push(cid);
        walk(cid);
      }
    }
  };
  walk(null);
  return out;
}

export function useArea(store: MergeableStore, id: string | undefined): Area | undefined {
  const row = useRow(TABLES.areas, id ?? '', store);
  if (!id || !row || Object.keys(row).length === 0) return undefined;
  const rawColor: unknown = row[COLUMNS.areas.color];
  const color: AreaColorId = isAreaColorId(rawColor) ? rawColor : 'gray';
  return {
    id,
    name: String(row[COLUMNS.areas.name] ?? ''),
    parentId: normalizeRelation(row[COLUMNS.areas.parentId]),
    color,
    order: Number(row[COLUMNS.areas.order] ?? 0),
    createdAt: String(row[COLUMNS.areas.createdAt] ?? ''),
    updatedAt: String(row[COLUMNS.areas.updatedAt] ?? ''),
  };
}
