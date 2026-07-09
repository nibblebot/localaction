import { describe, it, expect } from 'vitest';
import { createMergeableStore } from 'tinybase';
import { extractTags, getAllTagCounts, getNoteIdsForTag } from '../../src/data/tags.ts';
import { TABLES, COLUMNS } from '../../src/data/schema.ts';

function seedNote(store: ReturnType<typeof createMergeableStore>, id: string, body: string): void {
  store.setRow(TABLES.notes, id, {
    [COLUMNS.notes.slug]: id,
    [COLUMNS.notes.title]: 't',
    [COLUMNS.notes.body]: body,
    [COLUMNS.notes.entityType]: 'domain',
    [COLUMNS.notes.entityId]: 'd1',
    [COLUMNS.notes.createdAt]: '2026-01-01T00:00:00.000Z',
    [COLUMNS.notes.updatedAt]: '2026-01-01T00:00:00.000Z',
  });
}

describe('extractTags', () => {
  it('returns lowercased unique tags in source order', () => {
    expect(extractTags('hello #World and #foo and #world again')).toEqual(['world', 'foo']);
  });

  it('matches at line start, after whitespace, or after paren/bracket', () => {
    expect(extractTags('(#alpha) #beta\n#gamma')).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('ignores mid-word # but matches a # that follows whitespace', () => {
    expect(extractTags('a#nope and #yes! should also match')).toEqual(['yes']);
    expect(extractTags('words#nope still no match')).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(extractTags('')).toEqual([]);
  });
});

describe('getAllTagCounts', () => {
  it('aggregates counts across notes, sorted desc then alpha', () => {
    const store = createMergeableStore();
    seedNote(store, 'a', '#work #ship');
    seedNote(store, 'b', '#work #play');
    seedNote(store, 'c', '#ship #work #ship');
    const counts = getAllTagCounts(store);
    expect(counts).toEqual([
      { tag: 'work', count: 3 },
      { tag: 'ship', count: 2 },
      { tag: 'play', count: 1 },
    ]);
  });

  it('is case-insensitive (tags are normalised to lowercase)', () => {
    const store = createMergeableStore();
    seedNote(store, 'a', '#Work');
    seedNote(store, 'b', '#WORK');
    seedNote(store, 'c', '#work');
    expect(getAllTagCounts(store)).toEqual([{ tag: 'work', count: 3 }]);
  });
});

describe('getNoteIdsForTag', () => {
  it('returns ids whose body contains the tag', () => {
    const store = createMergeableStore();
    seedNote(store, 'a', '#work stuff');
    seedNote(store, 'b', 'no tags here');
    seedNote(store, 'c', '#WORK and #play');
    expect(getNoteIdsForTag(store, 'work').sort()).toEqual(['a', 'c']);
    expect(getNoteIdsForTag(store, 'play')).toEqual(['c']);
    expect(getNoteIdsForTag(store, 'nope')).toEqual([]);
  });
});
