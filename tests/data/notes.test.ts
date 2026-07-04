import { describe, expect, it, beforeEach } from 'vitest';
import { createMergeableStore } from 'tinybase';
import type { MergeableStore } from 'tinybase';
import { NOTE_ENTITY_TYPE } from '../../src/data/schema.ts';
import {
  createNote,
  updateNote,
  deleteNote,
  getNote,
  getNotesForEntity,
  getNoteBySlug,
  getNoteSlugLockReason,
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
      title: 'Meeting Notes',
      entityType: NOTE_ENTITY_TYPE.domain,
      entityId: 'd1',
    });
    const note = getNote(store, id);
    expect(note?.title).toBe('Meeting Notes');
    expect(note?.slug).toBe('meeting-notes');
    expect(note?.entityType).toBe(NOTE_ENTITY_TYPE.domain);
    expect(note?.entityId).toBe('d1');
    expect(note?.body).toBe('');
  });

  it('createNote de-duplicates slug collisions with a suffix', () => {
    const a = createNote(store, { title: 'Sync', entityType: NOTE_ENTITY_TYPE.domain, entityId: 'd1' });
    const b = createNote(store, { title: 'Sync', entityType: NOTE_ENTITY_TYPE.domain, entityId: 'd1' });
    expect(getNote(store, a)?.slug).toBe('sync');
    expect(getNote(store, b)?.slug).toBe('sync-2');
  });

  it('createNote falls back to a placeholder slug for empty titles', () => {
    const id = createNote(store, { title: '   ', entityType: NOTE_ENTITY_TYPE.domain, entityId: 'd1' });
    const slug = getNote(store, id)?.slug ?? '';
    expect(slug.length).toBeGreaterThan(0);
    expect(slug).toMatch(/^(untitled|note)/);
  });

  it('updateNote patches body and bumps updatedAt', async () => {
    const id = createNote(store, { title: 'N', entityType: NOTE_ENTITY_TYPE.domain, entityId: 'd1' });
    const before = getNote(store, id)?.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    updateNote(store, id, { body: '# Hello' });
    const after = getNote(store, id);
    expect(after?.body).toBe('# Hello');
    expect(after?.updatedAt).not.toBe(before);
  });

  it('updateNote re-derives slug on rename when nothing else links to the old title', () => {
    const id = createNote(store, { title: 'Old Name', entityType: NOTE_ENTITY_TYPE.domain, entityId: 'd1' });
    updateNote(store, id, { title: 'New Name' });
    expect(getNote(store, id)?.slug).toBe('new-name');
  });

  it('updateNote keeps the slug when another note body links the old title (lock)', () => {
    const a = createNote(store, { title: 'Linked', entityType: NOTE_ENTITY_TYPE.domain, entityId: 'd1' });
    const b = createNote(store, { title: 'Other', entityType: NOTE_ENTITY_TYPE.domain, entityId: 'd1' });
    updateNote(store, b, { body: 'See [[Linked]] for details' });
    updateNote(store, a, { title: 'Renamed' });
    expect(getNote(store, a)?.slug).toBe('linked');
  });

  it('getNoteSlugLockReason reports which note is holding the slug', () => {
    const a = createNote(store, { title: 'Linked', entityType: NOTE_ENTITY_TYPE.domain, entityId: 'd1' });
    const b = createNote(store, { title: 'Other', entityType: NOTE_ENTITY_TYPE.domain, entityId: 'd1' });
    updateNote(store, b, { body: 'See [[Linked]]' });
    const reason = getNoteSlugLockReason(store, a, 'Linked');
    expect(reason?.noteId).toBe(b);
  });

  it('updateNote can re-attach a note to a different entity', () => {
    const id = createNote(store, { title: 'N', entityType: NOTE_ENTITY_TYPE.domain, entityId: 'd1' });
    updateNote(store, id, { entityType: NOTE_ENTITY_TYPE.project, entityId: 'p1' });
    const after = getNote(store, id);
    expect(after?.entityType).toBe(NOTE_ENTITY_TYPE.project);
    expect(after?.entityId).toBe('p1');
  });

  it('deleteNote removes the row', () => {
    const id = createNote(store, { title: 'N', entityType: NOTE_ENTITY_TYPE.domain, entityId: 'd1' });
    deleteNote(store, id);
    expect(getNote(store, id)).toBeUndefined();
  });

  it('getNotesForEntity lists notes attached to a given entity', () => {
    const a = createNote(store, { title: 'A', entityType: NOTE_ENTITY_TYPE.domain, entityId: 'd1' });
    const b = createNote(store, { title: 'B', entityType: NOTE_ENTITY_TYPE.domain, entityId: 'd1' });
    createNote(store, { title: 'C', entityType: NOTE_ENTITY_TYPE.domain, entityId: 'd2' });
    expect(getNotesForEntity(store, NOTE_ENTITY_TYPE.domain, 'd1').sort()).toEqual([a, b].sort());
  });

  it('getNoteBySlug resolves a note by its slug', () => {
    const id = createNote(store, { title: 'My Note', entityType: NOTE_ENTITY_TYPE.domain, entityId: 'd1' });
    expect(getNoteBySlug(store, 'my-note')?.id).toBe(id);
    expect(getNoteBySlug(store, 'missing')).toBeUndefined();
  });

  it('getNote returns a normalised entity', () => {
    const id = createNote(store, { title: 'N', body: 'x', entityType: NOTE_ENTITY_TYPE.task, entityId: 't1' });
    const note = getNote(store, id);
    expect(note).toMatchObject({ id, title: 'N', body: 'x', slug: 'n', entityType: NOTE_ENTITY_TYPE.task, entityId: 't1' });
    expect(getNote(store, 'nope')).toBeUndefined();
  });
});
