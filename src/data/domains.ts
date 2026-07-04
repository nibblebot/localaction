/**
 * Domain entity actions and read helpers.
 *
 * The action creators (`createDomain`, `updateDomain`, `deleteDomain`) are
 * plain functions over a `MergeableStore` — they carry no React, so they can
 * be unit-tested directly and reused by the smoke / integration scripts.
 * Components obtain the store from `useDataLayer()` and pass it in.
 *
 * The read hook wrappers (`useDomains`, `useDomain`, `useChildDomains`)
 * delegate to `tinybase/ui-react` so consumers re-render on store changes.
 *
 * Orphan policy (issue 03): deleting a Domain never cascades to its children.
 * Children keep their `parentId` (now pointing at a missing row) and surface
 * via `getDomain(...).parentId === <deleted>` — the UI marks them "Orphaned".
 */

import { useRow, useRowIds } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES } from './schema.ts';
import { newId, nowIso, normalizeRelation, row } from './internal.ts';
import type { Domain, DomainInput, DomainPatch } from './types.ts';

/** Create a new Domain row. Returns the row id. */
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

/** Patch a Domain row's editable fields. Bumps `updatedAt`. */
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
  // `setPartialRow` ignores `undefined` cell values, so clearing `parentId`
  // (a nullable relation) must go through `delCell` — otherwise the old
  // parent pointer survives and the row looks like a child again.
  if (patch.parentId === null) {
    store.delCell(TABLES.domains, id, COLUMNS.domains.parentId);
  } else if (patch.parentId !== undefined) {
    next[COLUMNS.domains.parentId] = patch.parentId;
  }
  store.setPartialRow(TABLES.domains, id, row(next));
}

/** Delete a Domain row. Orphans children by design. */
export function deleteDomain(store: MergeableStore, id: string): void {
  store.delRow(TABLES.domains, id);
}

/** Read a single Domain as a typed entity, or `undefined` if missing. */
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

/**
 * Walk the parent chain from `id` up to its topmost reachable ancestor, then
 * return the path root-first, including the target.
 *
 * Stops at a missing parent so orphans resolve to a path beginning at
 * themselves — breadcrumbs render "Home > <orphan>" rather than throwing.
 */
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

/** All ids in the `domains` table (any nesting depth). */
export function getAllDomainIds(store: MergeableStore): string[] {
  return store.getRowIds(TABLES.domains);
}

/**
 * Top-level Domain ids (`parentId` is null / empty).
 *
 * The tree renders these as the root nodes; sub-Domains are children of
 * whichever Domain their `parentId` points at.
 */
export function getTopLevelDomainIds(store: MergeableStore): string[] {
  return store
    .getRowIds(TABLES.domains)
    .filter((id) => normalizeRelation(store.getCell(TABLES.domains, id, COLUMNS.domains.parentId)) === null);
}

/** Direct child Domain ids of `parentId`. */
export function getChildDomainIds(store: MergeableStore, parentId: string): string[] {
  return store
    .getRowIds(TABLES.domains)
    .filter((id) => store.getCell(TABLES.domains, id, COLUMNS.domains.parentId) === parentId);
}

/** Orphaned Domain ids — their `parentId` points at a Domain that no longer exists. */
export function getOrphanedDomainIds(store: MergeableStore): string[] {
  return store.getRowIds(TABLES.domains).filter((id) => {
    const parent = normalizeRelation(store.getCell(TABLES.domains, id, COLUMNS.domains.parentId));
    return parent !== null && !store.hasRow(TABLES.domains, parent);
  });
}

// --- React read hooks -------------------------------------------------------

/**
 * All top-level Domain ids, reactively. Children read this to render the
 * tree's root nodes.
 */
export function useDomains(store: MergeableStore): string[] {
  // TinyBase re-renders whenever the row id set changes; we filter on the
  // client for the parentId === null predicate so re-parents re-flow the
  // tree too.
  const allIds = useRowIds(TABLES.domains, store);
  return allIds.filter(
    (id) => store.getCell(TABLES.domains, id, COLUMNS.domains.parentId) === undefined,
  );
}

/** Direct child Domain ids of `parentId`, reactively. */
export function useChildDomains(store: MergeableStore, parentId: string): string[] {
  const allIds = useRowIds(TABLES.domains, store);
  return allIds.filter(
    (id) => store.getCell(TABLES.domains, id, COLUMNS.domains.parentId) === parentId,
  );
}

/** Read a single Domain as a typed entity, reactively. */
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