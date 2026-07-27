import { describe, expect, it } from 'vitest';
import { createMergeableStore } from 'tinybase';
import { dropLegacyPersonTables } from '../../src/data/schemaVersion.ts';

describe('dropLegacyPersonTables', () => {
  it('drops persons and person_links, keeps every other table, and is idempotent', () => {
    const store = createMergeableStore();
    store.setRow('persons', 'self', { name: 'Self' });
    store.setRow('person_links', 'area:a1:self', { personId: 'p1' });
    store.setRow('areas', 'a1', { name: 'Work' });
    dropLegacyPersonTables(store);
    expect(store.hasTable('persons')).toBe(false);
    expect(store.hasTable('person_links')).toBe(false);
    expect(store.getRow('areas', 'a1')).toEqual({ name: 'Work' });
    dropLegacyPersonTables(store); // no-op on stores without the tables
    expect(store.getRow('areas', 'a1')).toEqual({ name: 'Work' });
  });
});
