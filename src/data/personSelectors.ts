import type { MergeableStore } from 'tinybase';
import { useRowIds } from 'tinybase/ui-react';
import { COLUMNS, SELF_PERSON_ID, TABLES } from './schema.ts';
import type { NoteEntityType } from './schema.ts';
import { getEntityPersonIds } from './personLinks.ts';
import { useTableVersion } from './internal.ts';

/**
 * Person read-model:
 *   people(e) = {Self} ∪ ( storedSet(e) ∩ persons_present )
 *
 * Storage shape:
 *   - An entity's people live in the shared `person_links` table —
 *     there is no separate `cast` table; an Area's "cast" is simply
 *     its own link set.
 *   - Self is never stored as a link; force-unioned at read time.
 *   - Intersection with the current `persons` table implements
 *     deletion (I9) at read time — a deleted person drops out of
 *     every association automatically.
 *
 * Display order: Self first, then remaining persons alphabetical by
 * name — no `order` cell, no user-draggable order.
 */

function personPresent(store: MergeableStore, personId: string): boolean {
  return store.getRowIds(TABLES.persons).includes(personId);
}

function personName(store: MergeableStore, personId: string): string {
  return String(store.getCell(TABLES.persons, personId, COLUMNS.persons.name) ?? '');
}

/**
 * Canonical person ordering: Self first, then alphabetical by name.
 * Shared by the sidebar facet, the assignment popover, and the
 * read-model derivations so every surface lists people identically.
 *
 * `_version` is a React Compiler dependency token (see
 * `peopleForEntity`): callers inside components MUST pass a persons
 * version token (from `useTablesVersion`) so a rename re-sorts
 * instead of serving a memoised stale order.
 */
export function sortPersonIds(
  store: MergeableStore,
  ids: readonly string[],
  _version?: unknown,
): string[] {
  return [...ids].sort((a, b) => {
    // Self always first.
    if (a === SELF_PERSON_ID) return -1;
    if (b === SELF_PERSON_ID) return 1;
    return personName(store, a).localeCompare(personName(store, b));
  });
}

/**
 * The people of any entity (area, project, task): its stored links
 * filtered to present persons, unioned with {Self}. Always non-empty.
 *
 * `_version` is a React Compiler dependency token (see
 * `selectors.ts`): callers inside components MUST pass the values
 * from `usePeopleForEntity`, or the memoised result goes stale.
 */
export function peopleForEntity(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
  _version = 0,
): string[] {
  const stored = getEntityPersonIds(store, entityType, entityId);
  const present = stored.filter((pid) => personPresent(store, pid));
  return sortPersonIds(store, [...new Set([SELF_PERSON_ID, ...present])], _version);
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
 * Reactive: the people of an entity. The version token bumps on any
 * change to the persons or person_links tables (row adds/removes AND
 * cell changes like renames), feeding the React Compiler cache key so
 * the derived list can never go stale.
 */
export function usePeopleForEntity(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
): string[] {
  const v = useTableVersion(store, TABLES.persons) + useTableVersion(store, TABLES.person_links);
  return peopleForEntity(store, entityType, entityId, v);
}

/**
 * Reactive: the set of currently-present persons (for the filter
 * facet chip list and the assignment popover). Returns the `persons`
 * row ids; the component re-renders on any change.
 */
export function usePresentPersonIds(store: MergeableStore): string[] {
  return useRowIds(TABLES.persons, store);
}


