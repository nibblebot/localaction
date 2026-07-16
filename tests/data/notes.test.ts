import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, NOTE_ENTITY_TYPE, TABLES } from '../../src/data/schema.ts';
import {
  createNote,
  updateNote,
  deleteNote,
  getNote,
} from '../../src/data/notes.ts';

function freshStore(): MergeableStore {
  return createMergeableStore();
}

describe('notes', () => {
  let store: MergeableStore;
  beforeEach(() => {
    store = freshStore();
  });

  it('createNote writes a note with a kebab slug derived from the title', () => {
    const id = createNote(store, {
      title: 'My First Note',
      body: 'hello',
      entityType: NOTE_ENTITY_TYPE.area,
      entityId: 'd1',
    });
    const slug = String(store.getCell(TABLES.notes, id, COLUMNS.notes.slug));
    expect(slug).toBe('my-first-note');
  });

  it('createNote de-duplicates slug collisions with a suffix', () => {
    const a = createNote(store, {
      title: 'Same',
      body: '',
      entityType: NOTE_ENTITY_TYPE.area,
      entityId: 'd1',
    });
    const b = createNote(store, {
      title: 'Same',
      body: '',
      entityType: NOTE_ENTITY_TYPE.area,
      entityId: 'd1',
    });
    const aSlug = String(store.getCell(TABLES.notes, a, COLUMNS.notes.slug));
    const bSlug = String(store.getCell(TABLES.notes, b, COLUMNS.notes.slug));
    expect(aSlug).toBe('same');
    expect(bSlug).toBe('same-2');
  });

  it('createNote falls back to a placeholder slug for empty titles', () => {
    const id = createNote(store, {
      title: '',
      body: '',
      entityType: NOTE_ENTITY_TYPE.area,
      entityId: 'd1',
    });
    const slug = String(store.getCell(TABLES.notes, id, COLUMNS.notes.slug));
    expect(slug.length).toBeGreaterThan(0);
  });

  it('updateNote patches body and bumps updatedAt', () => {
    const id = createNote(store, {
      title: 'T',
      body: 'old',
      entityType: NOTE_ENTITY_TYPE.area,
      entityId: 'd1',
    });
    store.setCell(TABLES.notes, id, COLUMNS.notes.updatedAt, '2000-01-01T00:00:00Z');
    updateNote(store, id, { body: 'new' });
    const note = getNote(store, id);
    expect(note?.body).toBe('new');
    expect(note?.updatedAt).not.toBe('2000-01-01T00:00:00Z');
  });

  it('updateNote re-derives slug on rename', () => {
    const id = createNote(store, {
      title: 'Old',
      body: '',
      entityType: NOTE_ENTITY_TYPE.area,
      entityId: 'd1',
    });
    updateNote(store, id, { title: 'Brand New' });
    const slug = String(store.getCell(TABLES.notes, id, COLUMNS.notes.slug));
    expect(slug).toBe('brand-new');
  });

  it('deleteNote removes the row', () => {
    const id = createNote(store, {
      title: 'T',
      body: '',
      entityType: NOTE_ENTITY_TYPE.area,
      entityId: 'd1',
    });
    deleteNote(store, id);
    expect(store.hasRow(TABLES.notes, id)).toBe(false);
  });
});
