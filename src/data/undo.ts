import type { MergeableStore, Row } from 'tinybase';
import { TABLES } from './schema.ts';
import type { TableName, TombstoneEntityType } from './schema.ts';
import { attachedRowIds, collectDoomedSets } from './deletion.ts';
import { tombstoneId } from './tombstones.ts';

/**
 * Undo snapshots (the escape hatch). Tombstones make deletion
 * permanent and sync-convergent; they are the wrong tool for a 5-second
 * "didn't mean that" window. `captureSubtree` copies exactly the rows a
 * cascade will remove (it shares `collectDoomedSets` with the cascade, so
 * the two can never disagree) before the caller deletes, and
 * `restoreSubtree` puts them back. Once the undo window expires the
 * caller simply drops the snapshot — the tombstone has already done its
 * job.
 *
 * Restores cannot resurrect an owner deleted *after* the snapshot was
 * taken: restoring an area whose parent area was since deleted leaves
 * the area's relation dangling, which read models already tolerate.
 * Sequential deletes each take their own snapshot and undo
 * independently.
 */
export interface SubtreeSnapshot {
  readonly entityType: TombstoneEntityType;
  readonly entityId: string;
  /** Captured `[table, rowId, row]` tuples, copied at capture time. */
  readonly rows: ReadonlyArray<readonly [TableName, string, Row]>;
}

export function captureSubtree(
  store: MergeableStore,
  entityType: TombstoneEntityType,
  entityId: string,
): SubtreeSnapshot {
  const doomed = collectDoomedSets(store, entityType, entityId);
  const rows: [TableName, string, Row][] = [];
  const take = (table: TableName, ids: Iterable<string>): void => {
    for (const id of ids) {
      if (store.hasRow(table, id)) rows.push([table, id, { ...store.getRow(table, id) }]);
    }
  };
  take(TABLES.areas, doomed.areas);
  take(TABLES.tasks, doomed.tasks);
  take(TABLES.notes, attachedRowIds(store, TABLES.notes, doomed));
  return { entityType, entityId, rows };
}

/**
 * Re-insert every captured row and remove the root tombstone in a single
 * transaction. Atomicity matters: the tombstone reconciler sweeps after
 * every transaction, so if the rows returned while the tombstone still
 * stood it would immediately re-delete the restored subtree.
 */
export function restoreSubtree(store: MergeableStore, snapshot: SubtreeSnapshot): void {
  store.transaction(() => {
    for (const [table, id, r] of snapshot.rows) store.setRow(table, id, r);
    store.delRow(TABLES.tombstones, tombstoneId(snapshot.entityType, snapshot.entityId));
  });
}
