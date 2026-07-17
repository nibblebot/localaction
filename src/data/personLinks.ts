import type { MergeableStore } from 'tinybase';
import { useRowIds } from 'tinybase/ui-react';
import { COLUMNS, NOTE_ENTITY_TYPE, SELF_PERSON_ID, TABLES } from './schema.ts';
import type { NoteEntityType } from './schema.ts';
import { row } from './internal.ts';

/**
 * `person_links` table — one row per non-Self membership. Row id is
 * `${entityType}:${entityId}:${personId}` (ticket 05: deterministic
 * composite — two devices adding the same Person to the same entity
 * converge to one row; O(1) toggle via `store.hasRow`).
 *
 * Self is NEVER stored as a link. It is force-unioned at read time
 * (ticket 01). The input sanitiser here strips it defensively so a
 * caller's bad input cannot violate the invariant.
 */
function linkId(
  entityType: NoteEntityType,
  entityId: string,
  personId: string,
): string {
  return `${entityType}:${entityId}:${personId}`;
}

function isNoteEntityType(v: string): v is NoteEntityType {
  return v === NOTE_ENTITY_TYPE.area || v === NOTE_ENTITY_TYPE.project || v === NOTE_ENTITY_TYPE.task;
}

function assertEntityType(entityType: string): asserts entityType is NoteEntityType {
  if (!isNoteEntityType(entityType)) {
    throw new Error(
      `personLinks: entityType must be one of area|project|task (got "${entityType}")`,
    );
  }
}

function normaliseSet(personIds: readonly string[]): string[] {
  // Drop Self (never stored), de-dupe, and reject empties.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of personIds) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (id.length === 0) continue;
    if (id === SELF_PERSON_ID) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Replace the stored set of non-Self persons for an entity. The
 * effective set still includes Self via the read-time intersection
 * (I3, I5). Inputs containing Self or duplicates are sanitised.
 */
export function setEntityPersons(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
  personIds: readonly string[],
): void {
  assertEntityType(entityType);
  const wanted = normaliseSet(personIds);
  const wantedSet = new Set(wanted);
  // Read all rows once; del/set is the diff.
  for (const id of store.getRowIds(TABLES.person_links)) {
    if (store.getCell(TABLES.person_links, id, COLUMNS.person_links.entityType) !== entityType) continue;
    if (store.getCell(TABLES.person_links, id, COLUMNS.person_links.entityId) !== entityId) continue;
    const pid = store.getCell(TABLES.person_links, id, COLUMNS.person_links.personId);
    if (typeof pid !== 'string') continue;
    if (!wantedSet.has(pid)) {
      store.delRow(TABLES.person_links, id);
    }
  }
  for (const pid of wanted) {
    const id = linkId(entityType, entityId, pid);
    if (store.hasRow(TABLES.person_links, id)) continue;
    store.setRow(
      TABLES.person_links,
      id,
      row({
        [COLUMNS.person_links.personId]: pid,
        [COLUMNS.person_links.entityType]: entityType,
        [COLUMNS.person_links.entityId]: entityId,
      }),
    );
  }
}

export function addEntityPerson(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
  personId: string,
): void {
  assertEntityType(entityType);
  if (personId === SELF_PERSON_ID) return; // Self is never stored
  if (!store.hasRow(TABLES.persons, personId)) return;
  const id = linkId(entityType, entityId, personId);
  if (store.hasRow(TABLES.person_links, id)) return;
  store.setRow(
    TABLES.person_links,
    id,
    row({
      [COLUMNS.person_links.personId]: personId,
      [COLUMNS.person_links.entityType]: entityType,
      [COLUMNS.person_links.entityId]: entityId,
    }),
  );
}

export function removeEntityPerson(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
  personId: string,
): void {
  assertEntityType(entityType);
  if (personId === SELF_PERSON_ID) return; // Self is never stored
  const id = linkId(entityType, entityId, personId);
  if (!store.hasRow(TABLES.person_links, id)) return;
  store.delRow(TABLES.person_links, id);
}

export function getEntityPersonIds(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
): string[] {
  assertEntityType(entityType);
  const out: string[] = [];
  for (const id of store.getRowIds(TABLES.person_links)) {
    if (store.getCell(TABLES.person_links, id, COLUMNS.person_links.entityType) !== entityType) continue;
    if (store.getCell(TABLES.person_links, id, COLUMNS.person_links.entityId) !== entityId) continue;
    const pid = store.getCell(TABLES.person_links, id, COLUMNS.person_links.personId);
    if (typeof pid === 'string') out.push(pid);
  }
  return out;
}

export function getEntityIdsForPerson(
  store: MergeableStore,
  personId: string,
): { entityType: NoteEntityType; entityId: string }[] {
  const out: { entityType: NoteEntityType; entityId: string }[] = [];
  if (personId === SELF_PERSON_ID) return out;
  for (const id of store.getRowIds(TABLES.person_links)) {
    if (store.getCell(TABLES.person_links, id, COLUMNS.person_links.personId) !== personId) continue;
    const t = store.getCell(TABLES.person_links, id, COLUMNS.person_links.entityType);
    const e = store.getCell(TABLES.person_links, id, COLUMNS.person_links.entityId);
    if (typeof t !== 'string' || typeof e !== 'string') continue;
    if (!isNoteEntityType(t)) continue;
    out.push({ entityType: t, entityId: e });
  }
  return out;
}

/**
 * Reactive: ids of persons (non-Self) linked to a single entity.
 * Subscribes to the person_links table so any change re-renders.
 */
export function useEntityPersonIds(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
): string[] {
  useRowIds(TABLES.person_links, store);
  return getEntityPersonIds(store, entityType, entityId);
}
