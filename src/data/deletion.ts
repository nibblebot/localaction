import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES, NOTE_ENTITY_TYPE } from './schema.ts';
import type { TombstoneEntityType } from './schema.ts';
import { descendantAreaIds } from './areas.ts';
import {
  childTaskIds,
  descendantTaskIds,
  getPlacement,
  snapshotDerivedIntoStored,
} from './tasks.ts';
import { writeTombstone } from './tombstones.ts';

/**
 * Containment-aware deletion. Deleting an owner removes its
 * full subtree — descendant Areas, Task trees, and every Note
 * attached to any of them — and records a permanent typed
 * tombstone so the deletion wins over delayed or concurrent assignments
 * once offline replicas merge.
 *
 * The cascade is the single core used by both the public mutators (which
 * also write a tombstone) and the sync-driven reconciler (which does not
 * — the tombstone already arrived). `entityType`/`entityId` name the root
 * of the subtree to remove; nothing outside that subtree is touched.
 */
export interface DoomedSets {
  areas: Set<string>;
  tasks: Set<string>;
}

/**
 * Compute the full containment subtree rooted at `entityType`/`entityId`
 * without touching the store. Shared by the cascade (which deletes the
 * sets) and the undo snapshotter (which copies them first) so both always
 * agree on exactly which rows a deletion removes.
 */
export function collectDoomedSets(
  store: MergeableStore,
  entityType: TombstoneEntityType,
  entityId: string,
): DoomedSets {
  const doomedAreas = new Set<string>();
  const doomedTasks = new Set<string>();

  if (entityType === NOTE_ENTITY_TYPE.area) {
    for (const a of descendantAreaIds(store, entityId)) doomedAreas.add(a);
  } else if (entityType === NOTE_ENTITY_TYPE.task) {
    for (const t of descendantTaskIds(store, entityId)) doomedTasks.add(t);
  }

  // Tasks rooted at a doomed area drag their whole subtree in.
  for (const tid of store.getRowIds(TABLES.tasks)) {
    const placement = getPlacement(store, tid);
    if (placement.kind === 'task') continue;
    if (placement.kind !== 'area' || !doomedAreas.has(placement.id)) continue;
    for (const d of descendantTaskIds(store, tid)) doomedTasks.add(d);
  }

  return { areas: doomedAreas, tasks: doomedTasks };
}

/** Ids of note rows attached to any entity in `sets`. */
export function attachedRowIds(
  store: MergeableStore,
  table: typeof TABLES.notes,
  sets: DoomedSets,
): string[] {
  const out: string[] = [];
  for (const rid of store.getRowIds(table)) {
    if (isAttached(store, table, rid, sets.areas, sets.tasks)) out.push(rid);
  }
  return out;
}

export function cascadeDeleteSubtree(
  store: MergeableStore,
  entityType: TombstoneEntityType,
  entityId: string,
): boolean {
  // Parent→leaf conversion: when the deleted tree's root was the last
  // child of its parent, the parent converts to a leaf — snapshot its
  // derived status into the stored cell BEFORE the delete.
  if (entityType === NOTE_ENTITY_TYPE.task) {
    const placement = getPlacement(store, entityId);
    if (
      placement.kind === 'task' &&
      store.hasRow(TABLES.tasks, placement.id) &&
      childTaskIds(store, placement.id).length === 1
    ) {
      // The deleted root was the parent's only child → the parent
      // converts to a leaf.
      snapshotDerivedIntoStored(store, placement.id);
    }
  }

  const doomed = collectDoomedSets(store, entityType, entityId);

  let changed = false;
  const deleteIfPresent = (table: string, id: string): void => {
    if (store.hasRow(table, id)) {
      store.delRow(table, id);
      changed = true;
    }
  };

  for (const tid of doomed.tasks) deleteIfPresent(TABLES.tasks, tid);
  for (const aid of doomed.areas) deleteIfPresent(TABLES.areas, aid);

  // Strip attached notes for every doomed entity.
  for (const nid of attachedRowIds(store, TABLES.notes, doomed)) {
    deleteIfPresent(TABLES.notes, nid);
  }
  return changed;
}

function isAttached(
  store: MergeableStore,
  table: string,
  rowId: string,
  areas: Set<string>,
  tasks: Set<string>,
): boolean {
  const t = store.getCell(table, rowId, COLUMNS.notes.entityType);
  const eid = String(store.getCell(table, rowId, COLUMNS.notes.entityId) ?? '');
  if (t === NOTE_ENTITY_TYPE.area) return areas.has(eid);
  if (t === NOTE_ENTITY_TYPE.task) return tasks.has(eid);
  return false;
}

export function deleteArea(store: MergeableStore, id: string): void {
  if (!store.hasRow(TABLES.areas, id)) return;
  writeTombstone(store, NOTE_ENTITY_TYPE.area, id);
  cascadeDeleteSubtree(store, NOTE_ENTITY_TYPE.area, id);
}

export function deleteTask(store: MergeableStore, id: string): void {
  if (!store.hasRow(TABLES.tasks, id)) return;
  writeTombstone(store, NOTE_ENTITY_TYPE.task, id);
  cascadeDeleteSubtree(store, NOTE_ENTITY_TYPE.task, id);
}

/**
 * Sweep every tombstone and remove any subtree that is still present.
 * Idempotent: deleting already-absent rows is a no-op, so re-running on
 * the same tombstone set converges. This is what makes deletion win after
 * sync merges — including descendants an offline replica added under an
 * already-deleted owner.
 */
export function reconcileTombstones(store: MergeableStore): boolean {
  const tombIds = store.getRowIds(TABLES.tombstones);
  if (tombIds.length === 0) return false;
  let any = false;
  for (const tid of tombIds) {
    const entityType = store.getCell(
      TABLES.tombstones,
      tid,
      COLUMNS.tombstones.entityType,
    ) as TombstoneEntityType;
    const entityId = String(
      store.getCell(TABLES.tombstones, tid, COLUMNS.tombstones.entityId) ?? '',
    );
    if (entityType !== 'area' && entityType !== 'task') {
      continue;
    }
    if (cascadeDeleteSubtree(store, entityType, entityId)) any = true;
  }
  return any;
}

const installed = new WeakSet<MergeableStore>();

// True while the reconciler's microtask sweep is executing. The sync log
// reads this to classify the sweep's transactions as 'sweep' rather than
// user 'push'. `reconcileTombstones` is only ever invoked from the `run`
// closure below, so wrapping it there covers exactly the reconciler's
// sweeps and nothing else.
let sweepActive = false;

export function isReconcileSweepActive(): boolean {
  return sweepActive;
}

/**
 * Idempotently attaches the tombstone reconciler to a store. Schedules a
 * `reconcileTombstones` sweep after every transaction (local or merged),
 * coalesced to a microtask so bursts don't multiply sweeps. Returns an
 * unsubscribe. Call once per store (the provider does this); safe to call
 * again — subsequent calls are no-ops.
 */
export function installTombstoneReconciler(store: MergeableStore): () => void {
  if (installed.has(store)) return () => {};
  installed.add(store);
  let scheduled = false;
  const run = (): void => {
    scheduled = false;
    sweepActive = true;
    try {
      reconcileTombstones(store);
    } finally {
      sweepActive = false;
    }
  };
  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(run);
  };
  const listenerId = store.addDidFinishTransactionListener(schedule);
  schedule();
  return () => {
    store.delListener(listenerId);
    installed.delete(store);
  };
}
