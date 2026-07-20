import { useRowIds } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES } from './schema.ts';
import type { TombstoneEntityType } from './schema.ts';
import { nowIso, row } from './internal.ts';
import type { Tombstone } from './types.ts';

/**
 * Permanent deletion records (ADR-0001). A tombstone's id is the
 * deterministic composite `${entityType}:${entityId}`, so two devices
 * deleting the same entity converge to one row under sync. Tombstones are
 * never removed; the reconciler deletes any entity whose containment
 * subtree is rooted at a tombstoned target.
 */
export function tombstoneId(entityType: TombstoneEntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

export function writeTombstone(
  store: MergeableStore,
  entityType: TombstoneEntityType,
  entityId: string,
): void {
  store.setRow(
    TABLES.tombstones,
    tombstoneId(entityType, entityId),
    row({
      [COLUMNS.tombstones.entityType]: entityType,
      [COLUMNS.tombstones.entityId]: entityId,
      [COLUMNS.tombstones.deletedAt]: nowIso(),
    }),
  );
}

export function hasTombstone(
  store: MergeableStore,
  entityType: TombstoneEntityType,
  entityId: string,
): boolean {
  return store.hasRow(TABLES.tombstones, tombstoneId(entityType, entityId));
}

export function getTombstone(
  store: MergeableStore,
  entityType: TombstoneEntityType,
  entityId: string,
): Tombstone | undefined {
  const r = store.getRow(TABLES.tombstones, tombstoneId(entityType, entityId));
  if (!r || Object.keys(r).length === 0) return undefined;
  return {
    id: tombstoneId(entityType, entityId),
    entityType: String(r[COLUMNS.tombstones.entityType] ?? entityType) as TombstoneEntityType,
    entityId: String(r[COLUMNS.tombstones.entityId] ?? entityId),
    deletedAt: String(r[COLUMNS.tombstones.deletedAt] ?? ''),
  };
}

export function useTombstoneIds(store: MergeableStore): string[] {
  return useRowIds(TABLES.tombstones, store);
}
