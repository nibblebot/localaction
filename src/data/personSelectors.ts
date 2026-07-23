import type { MergeableStore } from 'tinybase';
import { useRowIds } from 'tinybase/ui-react';
import { COLUMNS, NOTE_ENTITY_TYPE, SELF_PERSON_ID, TABLES } from './schema.ts';
import type { NoteEntityType } from './schema.ts';
import { getEntityPersonIds } from './personLinks.ts';
import { normalizeRelation, useTableVersion } from './internal.ts';
import { getRootPlacement } from './tasks.ts';

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

/**
 * The persons an entity may draw its assignment from — the resolved
 * people of its hierarchical scope parent:
 *   - sub-area → its parent area's people; a top-level area (no
 *     parent) scopes to everyone;
 *   - project → its owning area's people; an area-less project scopes
 *     to everyone;
 *   - task → its root project's people; an area/inbox-rooted task
 *     scopes to everyone.
 *
 * The assignment popover offers this set (plus any assignees already
 * on the entity) so a child can only add members that already belong
 * to its parent — narrowing down the hierarchy, never widening.
 */
export function getEntityAllowedPersons(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
  _version = 0,
): string[] {
  switch (entityType) {
    case NOTE_ENTITY_TYPE.area: {
      const parentId = normalizeRelation(
        store.getCell(TABLES.areas, entityId, COLUMNS.areas.parentId),
      );
      return parentId === null
        ? sortPersonIds(store, presentPersonIds(store), _version)
        : peopleForEntity(store, NOTE_ENTITY_TYPE.area, parentId, _version);
    }
    case NOTE_ENTITY_TYPE.project: {
      const areaId = normalizeRelation(
        store.getCell(TABLES.projects, entityId, COLUMNS.projects.areaId),
      );
      return areaId === null
        ? sortPersonIds(store, presentPersonIds(store), _version)
        : peopleForEntity(store, NOTE_ENTITY_TYPE.area, areaId, _version);
    }
    case NOTE_ENTITY_TYPE.task: {
      const root = getRootPlacement(store, entityId);
      return root.kind === 'project'
        ? peopleForEntity(store, NOTE_ENTITY_TYPE.project, root.id, _version)
        : sortPersonIds(store, presentPersonIds(store), _version);
    }
  }
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

/**
 * Reactive: the persons an entity may draw assignments from. Subscribes
 * to every table the parent pointer can touch — persons/links for the
 * parent set itself, areas/projects/sections/tasks for the parent edge —
 * so a reparent or a parent-cast change re-renders immediately.
 */
export function useEntityAllowedPersons(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
): string[] {
  const v =
    useTableVersion(store, TABLES.persons) +
    useTableVersion(store, TABLES.person_links) +
    useTableVersion(store, TABLES.areas) +
    useTableVersion(store, TABLES.projects) +
    useTableVersion(store, TABLES.sections) +
    useTableVersion(store, TABLES.tasks);
  return getEntityAllowedPersons(store, entityType, entityId, v);
}
