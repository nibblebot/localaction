import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import {
  COLUMNS,
  NOTE_ENTITY_TYPE,
  SELF_PERSON_ID,
  TABLES,
} from '../../src/data/schema.ts';
import {
  createPerson,
  deletePerson,
  ensureSelfPerson,
  getPerson,
  initials,
  nameDerivedHue,
  updatePerson,
} from '../../src/data/persons.ts';
import {
  setEntityPersons,
  addEntityPerson,
  removeEntityPerson,
  getEntityPersonIds,
  getEntityIdsForPerson,
} from '../../src/data/personLinks.ts';
import { getEntityAllowedPersons, peopleForEntity, sortPersonIds } from '../../src/data/personSelectors.ts';
import { row } from '../../src/data/internal.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

function seedArea(
  store: MergeableStore,
  id: string,
  name: string,
  parentId: string | null = null,
): void {
  store.setRow(
    TABLES.areas,
    id,
    row({
      [COLUMNS.areas.name]: name,
      [COLUMNS.areas.parentId]: parentId,
      [COLUMNS.areas.color]: 'gray',
      [COLUMNS.areas.order]: 1000,
      [COLUMNS.areas.createdAt]: '2026-01-01T00:00:00Z',
      [COLUMNS.areas.updatedAt]: '2026-01-01T00:00:00Z',
    }),
  );
}

describe('initials', () => {
  it('returns word-initials for a two-word name', () => {
    expect(initials('Joshua Brown')).toBe('JB');
  });

  it('returns a single letter for a one-word name', () => {
    expect(initials('Mom')).toBe('M');
  });

  it('uses the first and last word for a multi-word name', () => {
    expect(initials('Joshua David Brown')).toBe('JB');
  });

  it('returns "?" for an empty or whitespace-only name', () => {
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });

  it('upper-cases the initials', () => {
    expect(initials('alice cooper')).toBe('AC');
  });
});

describe('nameDerivedHue', () => {
  it('is deterministic for the same name', () => {
    expect(nameDerivedHue('Mom')).toBe(nameDerivedHue('Mom'));
  });

  it('produces different hues for different names', () => {
    expect(nameDerivedHue('Mom')).not.toBe(nameDerivedHue('Dad'));
  });

  it('returns a #rrggbb string', () => {
    expect(nameDerivedHue('Self')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('createPerson', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('writes a person with the given name and a name-derived default color', () => {
    const id = createPerson(store, { name: 'Mom' });
    const got = getPerson(store, id);
    expect(got?.name).toBe('Mom');
    expect(got?.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(got?.color).toBe(nameDerivedHue('Mom'));
  });

  it('uses a caller-supplied color when one is provided', () => {
    const id = createPerson(store, { name: 'Mom', color: '#ff00ff' });
    expect(getPerson(store, id)?.color).toBe('#ff00ff');
  });

  it('seeds the Self row with id "self" when name is "Self"', () => {
    const id = createPerson(store, { name: 'Self' });
    expect(id).toBe(SELF_PERSON_ID);
    expect(store.hasRow(TABLES.persons, SELF_PERSON_ID)).toBe(true);
  });

  it('returns distinct ids for distinct calls', () => {
    const a = createPerson(store, { name: 'Mom' });
    const b = createPerson(store, { name: 'Dad' });
    expect(a).not.toBe(b);
  });
});

describe('updatePerson', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('patches name and color and bumps updatedAt', () => {
    const id = createPerson(store, { name: 'Mom' });
    store.setCell(TABLES.persons, id, COLUMNS.persons.updatedAt, '1999-01-01T00:00:00Z');
    const before = String(store.getCell(TABLES.persons, id, COLUMNS.persons.updatedAt));
    updatePerson(store, id, { name: 'Mother', color: '#abcdef' });
    const got = getPerson(store, id);
    expect(got?.name).toBe('Mother');
    expect(got?.color).toBe('#abcdef');
    expect(got?.updatedAt).not.toBe(before);
  });
});

describe('renaming Self', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
    ensureSelfPerson(store);
    updatePerson(store, SELF_PERSON_ID, { name: 'Joshua' });
  });

  it('keeps the canonical id with the new display name', () => {
    const self = getPerson(store, SELF_PERSON_ID);
    expect(self?.id).toBe(SELF_PERSON_ID);
    expect(self?.name).toBe('Joshua');
  });

  it('stays first in canonical order', () => {
    const mom = createPerson(store, { name: 'Mom' });
    expect(sortPersonIds(store, [mom, SELF_PERSON_ID])).toEqual([
      SELF_PERSON_ID,
      mom,
    ]);
  });

  it('stays force-unioned into every entity\'s people', () => {
    expect(peopleForEntity(store, NOTE_ENTITY_TYPE.area, 'A1')).toEqual([
      SELF_PERSON_ID,
    ]);
  });

  it('stays non-deletable', () => {
    deletePerson(store, SELF_PERSON_ID);
    expect(getPerson(store, SELF_PERSON_ID)?.name).toBe('Joshua');
  });

  it('is not re-seeded back to "Self" by the bootstrap', () => {
    ensureSelfPerson(store);
    expect(getPerson(store, SELF_PERSON_ID)?.name).toBe('Joshua');
  });
});

describe('deletePerson', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('removes a non-Self person', () => {
    const id = createPerson(store, { name: 'Mom' });
    deletePerson(store, id);
    expect(store.hasRow(TABLES.persons, id)).toBe(false);
  });

  it('refuses to delete Self (no-op)', () => {
    ensureSelfPerson(store);
    deletePerson(store, SELF_PERSON_ID);
    expect(store.hasRow(TABLES.persons, SELF_PERSON_ID)).toBe(true);
  });
});

describe('ensureSelfPerson', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('seeds Self if absent', () => {
    ensureSelfPerson(store);
    const got = getPerson(store, SELF_PERSON_ID);
    expect(got?.name).toBe('Self');
  });

  it('is idempotent — does not overwrite an existing Self row', () => {
    ensureSelfPerson(store);
    store.setCell(TABLES.persons, SELF_PERSON_ID, COLUMNS.persons.color, '#000000');
    ensureSelfPerson(store);
    expect(String(store.getCell(TABLES.persons, SELF_PERSON_ID, COLUMNS.persons.color))).toBe('#000000');
  });
});

describe('setEntityPersons', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('replaces the stored set, dropping removed and adding new', () => {
    const mom = createPerson(store, { name: 'Mom' });
    const dad = createPerson(store, { name: 'Dad' });
    const kid = createPerson(store, { name: 'Kid' });
    setEntityPersons(store, NOTE_ENTITY_TYPE.area, 'A1', [mom, dad]);
    expect(getEntityPersonIds(store, NOTE_ENTITY_TYPE.area, 'A1').sort()).toEqual([dad, mom].sort());
    setEntityPersons(store, NOTE_ENTITY_TYPE.area, 'A1', [mom, kid]);
    expect(getEntityPersonIds(store, NOTE_ENTITY_TYPE.area, 'A1').sort()).toEqual([kid, mom].sort());
  });

  it('strips Self from the input (Self is never stored)', () => {
    ensureSelfPerson(store);
    const mom = createPerson(store, { name: 'Mom' });
    setEntityPersons(store, NOTE_ENTITY_TYPE.area, 'A1', [mom, SELF_PERSON_ID]);
    expect(getEntityPersonIds(store, NOTE_ENTITY_TYPE.area, 'A1')).toEqual([mom]);
  });

  it('uses deterministic composite ids — duplicate calls are no-ops', () => {
    const mom = createPerson(store, { name: 'Mom' });
    setEntityPersons(store, NOTE_ENTITY_TYPE.area, 'A1', [mom]);
    const before = store.getRowIds(TABLES.person_links).length;
    setEntityPersons(store, NOTE_ENTITY_TYPE.area, 'A1', [mom]);
    expect(store.getRowIds(TABLES.person_links).length).toBe(before);
  });
});

describe('addEntityPerson / removeEntityPerson', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('toggles a single person in/out of an entity', () => {
    const mom = createPerson(store, { name: 'Mom' });
    addEntityPerson(store, NOTE_ENTITY_TYPE.area, 'A1', mom);
    expect(getEntityPersonIds(store, NOTE_ENTITY_TYPE.area, 'A1')).toEqual([mom]);
    removeEntityPerson(store, NOTE_ENTITY_TYPE.area, 'A1', mom);
    expect(getEntityPersonIds(store, NOTE_ENTITY_TYPE.area, 'A1')).toEqual([]);
  });

  it('ignores Self on add/remove (Self is never stored)', () => {
    ensureSelfPerson(store);
    addEntityPerson(store, NOTE_ENTITY_TYPE.area, 'A1', SELF_PERSON_ID);
    expect(getEntityPersonIds(store, NOTE_ENTITY_TYPE.area, 'A1')).toEqual([]);
    removeEntityPerson(store, NOTE_ENTITY_TYPE.area, 'A1', SELF_PERSON_ID);
    expect(getEntityPersonIds(store, NOTE_ENTITY_TYPE.area, 'A1')).toEqual([]);
  });
});

describe('getEntityIdsForPerson', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('returns the (entityType, entityId) pairs the person is linked to', () => {
    const mom = createPerson(store, { name: 'Mom' });
    setEntityPersons(store, NOTE_ENTITY_TYPE.area, 'A1', [mom]);
    setEntityPersons(store, NOTE_ENTITY_TYPE.task, 'T1', [mom]);
    const got = getEntityIdsForPerson(store, mom).sort((x, y) =>
      `${x.entityType}${x.entityId}`.localeCompare(`${y.entityType}${y.entityId}`),
    );
    expect(got).toEqual([
      { entityType: NOTE_ENTITY_TYPE.area, entityId: 'A1' },
      { entityType: NOTE_ENTITY_TYPE.task, entityId: 'T1' },
    ]);
  });

  it('returns nothing for Self (Self is never stored)', () => {
    ensureSelfPerson(store);
    expect(getEntityIdsForPerson(store, SELF_PERSON_ID)).toEqual([]);
  });
});

describe('people derivation (peopleForEntity)', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('an entity with no stored persons has the people {Self}', () => {
    expect(peopleForEntity(store, NOTE_ENTITY_TYPE.area, 'A1')).toEqual([SELF_PERSON_ID]);
  });

  it('an area carries its stored set, unioned with Self', () => {
    ensureSelfPerson(store);
    const mom = createPerson(store, { name: 'Mom' });
    setEntityPersons(store, NOTE_ENTITY_TYPE.area, 'A1', [mom]);
    expect(peopleForEntity(store, NOTE_ENTITY_TYPE.area, 'A1').sort()).toEqual([mom, SELF_PERSON_ID].sort());
  });

  it("a sub-area's people are its own stored set — no inheritance from the parent", () => {
    ensureSelfPerson(store);
    const mom = createPerson(store, { name: 'Mom' });
    const dad = createPerson(store, { name: 'Dad' });
    seedArea(store, 'P', 'Parent');
    seedArea(store, 'S', 'Sub', 'P');
    setEntityPersons(store, NOTE_ENTITY_TYPE.area, 'P', [mom, dad]);
    // Sub-area declares only {Mom}; its people are exactly {Mom, Self}.
    setEntityPersons(store, NOTE_ENTITY_TYPE.area, 'S', [mom]);
    const people = peopleForEntity(store, NOTE_ENTITY_TYPE.area, 'S');
    expect(people).toContain(SELF_PERSON_ID);
    expect(people).toContain(mom);
    expect(people).not.toContain(dad);
  });

  it('deleting a person removes them from every entity at read time (I9)', () => {
    ensureSelfPerson(store);
    const mom = createPerson(store, { name: 'Mom' });
    setEntityPersons(store, NOTE_ENTITY_TYPE.area, 'A1', [mom]);
    expect(peopleForEntity(store, NOTE_ENTITY_TYPE.area, 'A1')).toContain(mom);
    deletePerson(store, mom);
    expect(peopleForEntity(store, NOTE_ENTITY_TYPE.area, 'A1')).not.toContain(mom);
  });

  it('peopleForEntity always contains Self and falls back to {Self} when nothing is stored', () => {
    ensureSelfPerson(store);
    // No link rows at all → people are {Self}.
    expect(peopleForEntity(store, NOTE_ENTITY_TYPE.area, 'A1')).toEqual([SELF_PERSON_ID]);
  });

  it("a task's stored set is not narrowed by its area's people", () => {
    ensureSelfPerson(store);
    const mom = createPerson(store, { name: 'Mom' });
    const dad = createPerson(store, { name: 'Dad' });
    seedArea(store, 'A1', 'A1');
    setEntityPersons(store, NOTE_ENTITY_TYPE.area, 'A1', [mom]);
    // Task T1 declares {Mom, Dad}; Dad is not on the area but stays on the task.
    seedTask(store, 'T1', 'A1');
    setEntityPersons(store, NOTE_ENTITY_TYPE.task, 'T1', [mom, dad]);
    expect(peopleForEntity(store, NOTE_ENTITY_TYPE.task, 'T1').sort()).toEqual([SELF_PERSON_ID, mom, dad].sort());
  });
});

function seedTask(store: MergeableStore, id: string, areaId: string): void {
  // Helper to keep the test self-contained: seed a project + task in `areaId`.
  const projectId = `${areaId}-P`;
  store.setRow(
    TABLES.projects,
    projectId,
    row({
      [COLUMNS.projects.name]: 'P',
      [COLUMNS.projects.areaId]: areaId,
      [COLUMNS.projects.order]: 1000,
      [COLUMNS.projects.createdAt]: '2026-01-01T00:00:00Z',
      [COLUMNS.projects.updatedAt]: '2026-01-01T00:00:00Z',
    }),
  );
  store.setRow(
    TABLES.tasks,
    id,
    row({
      [COLUMNS.tasks.title]: 'T',
      [COLUMNS.tasks.placement]: `project:${projectId}`,
      [COLUMNS.tasks.status]: 'open',
      [COLUMNS.tasks.order]: 1000,
      [COLUMNS.tasks.createdAt]: '2026-01-01T00:00:00Z',
      [COLUMNS.tasks.updatedAt]: '2026-01-01T00:00:00Z',
    }),
  );
}

function seedProject(
  store: MergeableStore,
  id: string,
  areaId: string | null,
  name = 'P',
): void {
  const cells: Record<string, string | number> = {
    [COLUMNS.projects.name]: name,
    [COLUMNS.projects.order]: 1000,
    [COLUMNS.projects.createdAt]: '2026-01-01T00:00:00Z',
    [COLUMNS.projects.updatedAt]: '2026-01-01T00:00:00Z',
  };
  if (areaId !== null) cells[COLUMNS.projects.areaId] = areaId;
  store.setRow(TABLES.projects, id, row(cells));
}

function seedTaskWith(
  store: MergeableStore,
  id: string,
  placement: string | null,
): void {
  const cells: Record<string, string | number> = {
    [COLUMNS.tasks.title]: 'T',
    [COLUMNS.tasks.status]: 'open',
    [COLUMNS.tasks.order]: 1000,
    [COLUMNS.tasks.createdAt]: '2026-01-01T00:00:00Z',
    [COLUMNS.tasks.updatedAt]: '2026-01-01T00:00:00Z',
  };
  if (placement !== null) cells[COLUMNS.tasks.placement] = placement;
  store.setRow(TABLES.tasks, id, row(cells));
}

describe('allowed persons (getEntityAllowedPersons)', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
    ensureSelfPerson(store);
  });

  it('a top-level area scopes to every present person', () => {
    const mom = createPerson(store, { name: 'Mom' });
    const dad = createPerson(store, { name: 'Dad' });
    seedArea(store, 'A1', 'Area');
    const allowed = getEntityAllowedPersons(store, NOTE_ENTITY_TYPE.area, 'A1');
    expect(allowed).toContain(SELF_PERSON_ID);
    expect(allowed).toContain(mom);
    expect(allowed).toContain(dad);
  });

  it("a sub-area scopes to its parent area's people", () => {
    const mom = createPerson(store, { name: 'Mom' });
    const dad = createPerson(store, { name: 'Dad' });
    seedArea(store, 'P', 'Parent');
    seedArea(store, 'S', 'Sub', 'P');
    setEntityPersons(store, NOTE_ENTITY_TYPE.area, 'P', [mom, dad]);
    const allowed = getEntityAllowedPersons(store, NOTE_ENTITY_TYPE.area, 'S');
    expect(allowed).toContain(SELF_PERSON_ID);
    expect(allowed).toContain(mom);
    expect(allowed).toContain(dad);
  });

  it('narrows: a sub-area cannot draw a person absent from the parent', () => {
    const mom = createPerson(store, { name: 'Mom' });
    const dad = createPerson(store, { name: 'Dad' });
    seedArea(store, 'P', 'Parent');
    seedArea(store, 'S', 'Sub', 'P');
    setEntityPersons(store, NOTE_ENTITY_TYPE.area, 'P', [mom]);
    // Parent narrowed to {Mom}; Dad is present but off-limits to the child.
    const allowed = getEntityAllowedPersons(store, NOTE_ENTITY_TYPE.area, 'S');
    expect(allowed).toContain(mom);
    expect(allowed).not.toContain(dad);
  });

  it("a project scopes to its owning area's people", () => {
    const mom = createPerson(store, { name: 'Mom' });
    const dad = createPerson(store, { name: 'Dad' });
    seedArea(store, 'A1', 'Area');
    seedProject(store, 'P1', 'A1');
    setEntityPersons(store, NOTE_ENTITY_TYPE.area, 'A1', [mom]);
    const allowed = getEntityAllowedPersons(store, NOTE_ENTITY_TYPE.project, 'P1');
    expect(allowed).toContain(mom);
    expect(allowed).not.toContain(dad);
  });

  it('an area-less project scopes to every present person', () => {
    const mom = createPerson(store, { name: 'Mom' });
    seedProject(store, 'P1', null);
    const allowed = getEntityAllowedPersons(store, NOTE_ENTITY_TYPE.project, 'P1');
    expect(allowed).toContain(mom);
  });

  it("a task scopes to its root project's people", () => {
    const mom = createPerson(store, { name: 'Mom' });
    const dad = createPerson(store, { name: 'Dad' });
    seedArea(store, 'A1', 'Area');
    seedProject(store, 'P1', 'A1');
    seedTaskWith(store, 'T1', 'project:P1');
    setEntityPersons(store, NOTE_ENTITY_TYPE.project, 'P1', [mom]);
    const allowed = getEntityAllowedPersons(store, NOTE_ENTITY_TYPE.task, 'T1');
    expect(allowed).toContain(mom);
    expect(allowed).not.toContain(dad);
  });

  it('a sub-task resolves through its ancestry to the project', () => {
    const mom = createPerson(store, { name: 'Mom' });
    const dad = createPerson(store, { name: 'Dad' });
    seedArea(store, 'A1', 'Area');
    seedProject(store, 'P1', 'A1');
    seedTaskWith(store, 'T1', 'project:P1');
    seedTaskWith(store, 'T2', 'task:T1');
    setEntityPersons(store, NOTE_ENTITY_TYPE.project, 'P1', [mom]);
    const allowed = getEntityAllowedPersons(store, NOTE_ENTITY_TYPE.task, 'T2');
    expect(allowed).toContain(mom);
    expect(allowed).not.toContain(dad);
  });

  it('an area-rooted task scopes to every present person', () => {
    const mom = createPerson(store, { name: 'Mom' });
    seedArea(store, 'A1', 'Area');
    seedTaskWith(store, 'T1', 'area:A1');
    expect(getEntityAllowedPersons(store, NOTE_ENTITY_TYPE.task, 'T1')).toContain(mom);
  });

  it('an inbox task scopes to every present person', () => {
    const mom = createPerson(store, { name: 'Mom' });
    seedTaskWith(store, 'T1', null);
    expect(getEntityAllowedPersons(store, NOTE_ENTITY_TYPE.task, 'T1')).toContain(mom);
  });
});
