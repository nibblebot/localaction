import type { MergeableStore } from 'tinybase';
import { useRowIds, useTables } from 'tinybase/ui-react';
import { COLUMNS, NOTE_ENTITY_TYPE, SELF_PERSON_ID, TABLES } from './schema.ts';
import type { NoteEntityType } from './schema.ts';
import { getEntityPersonIds } from './personLinks.ts';
import { getRootPlacement } from './tasks.ts';

/**
 * Effective-set derivation (ticket 01):
 *   effectiveSet(e) = {Self} ∪ ( storedSet(e) ∩ effectiveCast(parent(e)) )
 *                     → {Self} if empty
 *
 * Storage-shape (ticket 05):
 *   - The cast of an Area is the same `person_links` set as a per-entity
 *     override — there is no separate `cast` table.
 *   - Self is never stored as a link; force-unioned at read time.
 *   - Intersection with the current `persons` table is what implements
 *     both narrowing and deletion (I9) at read time — a deleted person
 *     drops out of every cast/association automatically.
 *
 * Display order (ticket 05):
 *   Self first, then remaining persons alphabetical by name — no
 *   `order` cell, no user-draggable order.
 */

function personPresent(store: MergeableStore, personId: string): boolean {
  return store.getRowIds(TABLES.persons).includes(personId);
}

function personName(store: MergeableStore, personId: string): string {
  return String(store.getCell(TABLES.persons, personId, COLUMNS.persons.name) ?? '');
}

function sortPersonIds(store: MergeableStore, ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => {
    // Self always first.
    if (a === SELF_PERSON_ID) return -1;
    if (b === SELF_PERSON_ID) return 1;
    return personName(store, a).localeCompare(personName(store, b));
  });
}

/**
 * The effective cast of an area = its stored set ∩ persons_present.
 * (Sub-areas recurse up; projects and tasks inherit their single
 * direct parent's cast — see `effectiveCastForEntity`.)
 */
export function effectiveCastForArea(
  store: MergeableStore,
  areaId: string,
): string[] {
  // Walk the area tree upward, intersecting at each level.
  const seen = new Set<string>();
  const chain: string[] = []; // top → bottom
  let cur: string | null = areaId;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    chain.push(cur);
    const parent = store.getCell(TABLES.areas, cur, COLUMNS.areas.parentId);
    cur = typeof parent === 'string' ? parent : null;
  }
  // Intersect starting at the top.
  let acc: Set<string> | null = null;
  for (const id of chain) {
    const stored = new Set(getEntityPersonIds(store, NOTE_ENTITY_TYPE.area, id));
    // Filter to currently-present persons (a deleted person drops out, I9).
    // NB: `Array.prototype.filter` passes (value, index, array); the
    // shadowing of `store` by the third argument is intentional and
    // why we curry the lookup instead of relying on the outer binding.
    const present = new Set<string>();
    for (const pid of stored) {
      if (personPresent(store, pid)) present.add(pid);
    }
    if (acc === null) {
      acc = new Set(present);
    } else {
      const next = new Set<string>();
      for (const pid of acc) if (present.has(pid)) next.add(pid);
      acc = next;
    }
  }
  const base = acc ?? new Set<string>();
  // Self is always in the cast.
  base.add(SELF_PERSON_ID);
  return sortPersonIds(store, [...base]);
}

export function effectiveCastForEntity(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
): string[] {
  if (entityType === NOTE_ENTITY_TYPE.area) {
    return effectiveCastForArea(store, entityId);
  }
  // Project → area, Task → project → area.
  if (entityType === NOTE_ENTITY_TYPE.project) {
    const areaId = store.getCell(TABLES.projects, entityId, COLUMNS.projects.areaId);
    if (typeof areaId !== 'string') return [SELF_PERSON_ID];
    return effectiveCastForArea(store, areaId);
  }
  // task → resolve owner through the placement chain (ADR-0001)
  const root = getRootPlacement(store, entityId);
  if (root.kind === 'project') return effectiveCastForProject(store, root.id);
  if (root.kind === 'area') return effectiveCastForArea(store, root.id);
  return [SELF_PERSON_ID];
}

function effectiveCastForProject(
  store: MergeableStore,
  projectId: string,
): string[] {
  const areaId = store.getCell(TABLES.projects, projectId, COLUMNS.projects.areaId);
  if (typeof areaId !== 'string') return [SELF_PERSON_ID];
  return effectiveCastForArea(store, areaId);
}

/**
 * The full effective set for any entity (area, project, task).
 * Always non-empty: unioned with {Self}, falls back to {Self} if
 * everything intersects to empty.
 */
export function effectiveSetForEntity(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
): string[] {
  const stored = getEntityPersonIds(store, entityType, entityId);
  const cast = new Set(effectiveCastForEntity(store, entityType, entityId));
  // Self is implicitly always in the cast (I7).
  cast.add(SELF_PERSON_ID);
  const filtered = stored.filter((pid) => cast.has(pid));
  let effective: Set<string>;
  if (filtered.length === 0) {
    effective = new Set([SELF_PERSON_ID]);
  } else {
    effective = new Set([...filtered, SELF_PERSON_ID]);
  }
  return sortPersonIds(store, [...effective]);
}

/**
 * The effective cast of an area as a Set, intersected with the
 * present persons — used to constrain the assignment picker. Self
 * is always present (I7).
 */
export function effectiveCastSetForArea(
  store: MergeableStore,
  areaId: string,
): Set<string> {
  return new Set(effectiveCastForArea(store, areaId));
}

export function effectiveCastSetForEntity(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
): Set<string> {
  return new Set(effectiveCastForEntity(store, entityType, entityId));
}

/**
 * Test helper: set-of-present-persons, used by the read paths above
 * and exposed for code that needs the present id set without a full
 * set derivation (e.g. the filter "all entities for person Y"
 * reverse lookup).
 */
export function presentPersonIds(store: MergeableStore): string[] {
  return store.getRowIds(TABLES.persons);
}

// --- React hooks ---------------------------------------------------------

/**
 * Reactive: effective set for an entity. Subscribes to the persons
 * and person_links tables so any change re-renders.
 */
export function useEffectiveSet(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
): string[] {
  useRowIds(TABLES.persons, store);
  useRowIds(TABLES.person_links, store);
  useRowIds(TABLES.areas, store);
  useRowIds(TABLES.projects, store);
  useRowIds(TABLES.tasks, store);
  void useTables(store);
  return effectiveSetForEntity(store, entityType, entityId);
}

/**
 * Reactive: the effective cast of an area (used to render the
 * header cast chips and constrain the assignment picker).
 */
export function useEffectiveCast(store: MergeableStore, areaId: string): string[] {
  useRowIds(TABLES.persons, store);
  useRowIds(TABLES.person_links, store);
  useRowIds(TABLES.areas, store);
  useRowIds(TABLES.projects, store);
  useRowIds(TABLES.tasks, store);
  void useTables(store);
  return effectiveCastForArea(store, areaId);
}

/**
 * Reactive: the set of currently-present persons (for the filter
 * facet chip list). Returns the `persons` row ids; the component
 * re-renders on any change.
 */
export function usePresentPersonIds(store: MergeableStore): string[] {
  return useRowIds(TABLES.persons, store);
}