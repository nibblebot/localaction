import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES, NOTE_ENTITY_TYPE } from './schema.ts';
import type { NoteEntityType } from './schema.ts';
import { normalizeRelation } from './internal.ts';
import { descendantAreaIds } from './areas.ts';
import {
  descendantTaskIds,
  getPlacement,
} from './tasks.ts';
import { writeTombstone } from './tombstones.ts';

/**
 * Containment-aware deletion (ADR-0001). Deleting an owner removes its
 * full subtree — descendant Areas, Projects, Task trees, and every Note
 * and Person Link attached to any of them — and records a permanent typed
 * tombstone so the deletion wins over delayed or concurrent assignments
 * once offline replicas merge.
 *
 * The cascade is the single core used by both the public mutators (which
 * also write a tombstone) and the sync-driven reconciler (which does not
 * — the tombstone already arrived). `entityType`/`entityId` name the root
 * of the subtree to remove; nothing outside that subtree is touched.
 */
export function cascadeDeleteSubtree(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
): boolean {
  const doomedAreas = new Set<string>();
  const doomedProjects = new Set<string>();
  const doomedTasks = new Set<string>();

  if (entityType === NOTE_ENTITY_TYPE.area) {
    for (const a of descendantAreaIds(store, entityId)) doomedAreas.add(a);
  } else if (entityType === NOTE_ENTITY_TYPE.project) {
    doomedProjects.add(entityId);
  } else if (entityType === NOTE_ENTITY_TYPE.task) {
    for (const t of descendantTaskIds(store, entityId)) doomedTasks.add(t);
  }

  // Projects under any doomed area join the doomed set.
  for (const pid of store.getRowIds(TABLES.projects)) {
    const areaId = normalizeRelation(
      store.getCell(TABLES.projects, pid, COLUMNS.projects.areaId),
    );
    if (areaId !== null && doomedAreas.has(areaId)) doomedProjects.add(pid);
  }

  // Tasks rooted at a doomed area/project drag their whole subtree in.
  for (const tid of store.getRowIds(TABLES.tasks)) {
    const placement = getPlacement(store, tid);
    if (placement.kind === 'task') continue;
    const ownerDoomed =
      (placement.kind === 'area' && doomedAreas.has(placement.id)) ||
      (placement.kind === 'project' && doomedProjects.has(placement.id));
    if (!ownerDoomed) continue;
    for (const d of descendantTaskIds(store, tid)) doomedTasks.add(d);
  }

  let changed = false;
  const deleteIfPresent = (table: string, id: string): void => {
    if (store.hasRow(table, id)) {
      store.delRow(table, id);
      changed = true;
    }
  };

  for (const tid of doomedTasks) deleteIfPresent(TABLES.tasks, tid);
  for (const pid of doomedProjects) deleteIfPresent(TABLES.projects, pid);
  for (const aid of doomedAreas) deleteIfPresent(TABLES.areas, aid);

  // Strip attachments (notes + person links) for every doomed entity.
  for (const nid of store.getRowIds(TABLES.notes)) {
    if (isAttached(store, TABLES.notes, nid, doomedAreas, doomedProjects, doomedTasks)) {
      deleteIfPresent(TABLES.notes, nid);
    }
  }
  for (const lid of store.getRowIds(TABLES.person_links)) {
    if (isAttached(store, TABLES.person_links, lid, doomedAreas, doomedProjects, doomedTasks)) {
      deleteIfPresent(TABLES.person_links, lid);
    }
  }
  return changed;
}

function isAttached(
  store: MergeableStore,
  table: string,
  rowId: string,
  areas: Set<string>,
  projects: Set<string>,
  tasks: Set<string>,
): boolean {
  const t = store.getCell(table, rowId, COLUMNS.notes.entityType);
  const eid = String(store.getCell(table, rowId, COLUMNS.notes.entityId) ?? '');
  if (t === NOTE_ENTITY_TYPE.area) return areas.has(eid);
  if (t === NOTE_ENTITY_TYPE.project) return projects.has(eid);
  if (t === NOTE_ENTITY_TYPE.task) return tasks.has(eid);
  return false;
}

export function deleteArea(store: MergeableStore, id: string): void {
  if (!store.hasRow(TABLES.areas, id)) return;
  writeTombstone(store, NOTE_ENTITY_TYPE.area, id);
  cascadeDeleteSubtree(store, NOTE_ENTITY_TYPE.area, id);
}

export function deleteProject(store: MergeableStore, id: string): void {
  if (!store.hasRow(TABLES.projects, id)) return;
  writeTombstone(store, NOTE_ENTITY_TYPE.project, id);
  cascadeDeleteSubtree(store, NOTE_ENTITY_TYPE.project, id);
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
    ) as NoteEntityType;
    const entityId = String(
      store.getCell(TABLES.tombstones, tid, COLUMNS.tombstones.entityId) ?? '',
    );
    if (entityType !== 'area' && entityType !== 'project' && entityType !== 'task') continue;
    if (cascadeDeleteSubtree(store, entityType, entityId)) any = true;
  }
  return any;
}

const installed = new WeakSet<MergeableStore>();

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
    reconcileTombstones(store);
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
