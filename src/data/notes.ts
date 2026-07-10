import { useMemo } from 'react';
import { useRow, useRowIds } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES, NOTE_ENTITY_TYPE } from './schema.ts';
import type { NoteEntityType } from './schema.ts';
import { newId, nowIso, normalizeRelation, row } from './internal.ts';
import { slugify } from './slug.ts';
import { extractWikiLinks } from '../markdown/wikiLinks.ts';
import { buildNoteIndex } from '../markdown/render.ts';
import type { Note, NoteInput, NotePatch } from './types.ts';

const PLACEHOLDER_SLUG_PREFIX = 'note';

function uniqueSlug(
  store: MergeableStore,
  title: string,
  exceptId?: string,
): string {
  const base = slugify(title);
  const root = base.length === 0 ? PLACEHOLDER_SLUG_PREFIX : base;
  const taken = new Set(
    store
      .getRowIds(TABLES.notes)
      .filter((id) => id !== exceptId)
      .map((id) => String(store.getCell(TABLES.notes, id, COLUMNS.notes.slug) ?? '')),
  );
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}

export function createNote(store: MergeableStore, input: NoteInput): string {
  const id = newId();
  const ts = nowIso();
  const slug = uniqueSlug(store, input.title);
  store.setRow(
    TABLES.notes,
    id,
    row({
      [COLUMNS.notes.slug]: slug,
      [COLUMNS.notes.title]: input.title,
      [COLUMNS.notes.body]: input.body ?? '',
      [COLUMNS.notes.entityType]: input.entityType,
      [COLUMNS.notes.entityId]: input.entityId,
      [COLUMNS.notes.createdAt]: ts,
      [COLUMNS.notes.updatedAt]: ts,
    }),
  );
  return id;
}

export function getNoteSlugLockReason(
  store: MergeableStore,
  noteId: string,
  expectedTitle: string,
): { noteId: string } | undefined {
  const target = expectedTitle.trim();
  if (!target) return undefined;
  for (const id of store.getRowIds(TABLES.notes)) {
    if (id === noteId) continue;
    const body = String(store.getCell(TABLES.notes, id, COLUMNS.notes.body) ?? '');
    const titles = extractWikiLinks(body);
    if (titles.some((t) => t.toLowerCase() === target.toLowerCase())) {
      return { noteId: id };
    }
  }
  return undefined;
}

export function updateNote(store: MergeableStore, id: string, patch: NotePatch): void {
  if (!store.hasRow(TABLES.notes, id)) return;
  const next: Record<string, string | undefined> = {
    [COLUMNS.notes.updatedAt]: nowIso(),
  };
  if (patch.body !== undefined) next[COLUMNS.notes.body] = patch.body;
  if (patch.entityType !== undefined) next[COLUMNS.notes.entityType] = patch.entityType;
  if (patch.entityId === null) {
    store.delCell(TABLES.notes, id, COLUMNS.notes.entityId);
  } else if (patch.entityId !== undefined) {
    next[COLUMNS.notes.entityId] = patch.entityId;
  }

  if (patch.title !== undefined) {
    next[COLUMNS.notes.title] = patch.title;
    const oldTitle = String(store.getCell(TABLES.notes, id, COLUMNS.notes.title) ?? '');
    const locked = getNoteSlugLockReason(store, id, oldTitle);
    if (!locked) {
      next[COLUMNS.notes.slug] = uniqueSlug(store, patch.title, id);
    }
  }
  store.setPartialRow(TABLES.notes, id, row(next));
}

export function deleteNote(store: MergeableStore, id: string): void {
  store.delRow(TABLES.notes, id);
}

export function getNote(store: MergeableStore, id: string): Note | undefined {
  const r = store.getRow(TABLES.notes, id);
  if (!r || Object.keys(r).length === 0) return undefined;
  return {
    id,
    slug: String(r[COLUMNS.notes.slug] ?? ''),
    title: String(r[COLUMNS.notes.title] ?? ''),
    body: String(r[COLUMNS.notes.body] ?? ''),
    entityType: String(r[COLUMNS.notes.entityType] ?? NOTE_ENTITY_TYPE.domain) as NoteEntityType,
    entityId: normalizeRelation(r[COLUMNS.notes.entityId]),
    createdAt: String(r[COLUMNS.notes.createdAt] ?? ''),
    updatedAt: String(r[COLUMNS.notes.updatedAt] ?? ''),
  };
}

export function getNotesForEntity(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
): string[] {
  return store
    .getRowIds(TABLES.notes)
    .filter(
      (id) =>
        store.getCell(TABLES.notes, id, COLUMNS.notes.entityType) === entityType &&
        store.getCell(TABLES.notes, id, COLUMNS.notes.entityId) === entityId,
    );
}

export function getNoteBySlug(store: MergeableStore, slug: string): Note | undefined {
  const id = store
    .getRowIds(TABLES.notes)
    .find((id) => store.getCell(TABLES.notes, id, COLUMNS.notes.slug) === slug);
  return id ? getNote(store, id) : undefined;
}


export function useNotesForEntity(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
): string[] {
  const allIds = useRowIds(TABLES.notes, store);
  return allIds.filter(
    (id) =>
      store.getCell(TABLES.notes, id, COLUMNS.notes.entityType) === entityType &&
      store.getCell(TABLES.notes, id, COLUMNS.notes.entityId) === entityId,
  );
}

export function useNote(store: MergeableStore, id: string | undefined): Note | undefined {
  const r = useRow(TABLES.notes, id ?? '', store);
  if (!id || !r || Object.keys(r).length === 0) return undefined;
  return {
    id,
    slug: String(r[COLUMNS.notes.slug] ?? ''),
    title: String(r[COLUMNS.notes.title] ?? ''),
    body: String(r[COLUMNS.notes.body] ?? ''),
    entityType: String(r[COLUMNS.notes.entityType] ?? NOTE_ENTITY_TYPE.domain) as NoteEntityType,
    entityId: normalizeRelation(r[COLUMNS.notes.entityId]),
    createdAt: String(r[COLUMNS.notes.createdAt] ?? ''),
    updatedAt: String(r[COLUMNS.notes.updatedAt] ?? ''),
  };
}

export function useNoteBySlug(store: MergeableStore, slug: string | undefined): Note | undefined {
  useRowIds(TABLES.notes, store);
  if (!slug) return undefined;
  return getNoteBySlug(store, slug);
}

export function useNoteIndex(
  store: MergeableStore,
  excludeId?: string,
): import('../markdown/render.ts').NoteIndex {
  const allIds = useRowIds(TABLES.notes, store);
  return useMemo(
    () =>
      buildNoteIndex(
        allIds
          .filter((id) => id !== excludeId)
          .map((id) => getNote(store, id))
          .filter((n): n is NonNullable<typeof n> => !!n)
          .map((n) => ({ id: n.id, slug: n.slug, title: n.title })),
      ),
    [store, allIds, excludeId],
  );
}

export function useAllNoteIds(store: MergeableStore): string[] {
  return useRowIds(TABLES.notes, store);
}

export function useNoteIdForSlug(store: MergeableStore, slug: string | undefined): string | undefined {
  useRowIds(TABLES.notes, store);
  if (!slug) return undefined;
  return getNoteBySlug(store, slug)?.id;
}

/**
 * Return the id of the single note attached to the given entity, if any.
 * If multiple notes are attached, the first one is returned (callers should
 * not create more than one note per entity — the UI enforces this).
 */
export function getEntityNoteId(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
): string | null {
  for (const id of store.getRowIds(TABLES.notes)) {
    if (
      store.getCell(TABLES.notes, id, COLUMNS.notes.entityType) === entityType &&
      store.getCell(TABLES.notes, id, COLUMNS.notes.entityId) === entityId
    ) {
      return id;
    }
  }
  return null;
}

/**
 * Find the single note for an entity, or create a new one with an empty body.
 * The title defaults to "Note" and is later re-derived on the first commit.
 */
export function getOrCreateEntityNote(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
): string {
  const existing = getEntityNoteId(store, entityType, entityId);
  if (existing) return existing;
  return createNote(store, { title: 'Note', body: '', entityType, entityId });
}

/**
 * Reactive: returns the id of the single note attached to the entity, or null.
 * Subscribes to the notes table.
 */
export function useEntityNoteId(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
): string | null {
  const allIds = useRowIds(TABLES.notes, store);
  for (const id of allIds) {
    if (
      store.getCell(TABLES.notes, id, COLUMNS.notes.entityType) === entityType &&
      store.getCell(TABLES.notes, id, COLUMNS.notes.entityId) === entityId
    ) {
      return id;
    }
  }
  return null;
}

/**
 * Reactive: true if the entity has at least one note with a non-empty body.
 * Subscribes to the note row so that body edits re-render the indicator.
 */
export function useEntityNoteExists(
  store: MergeableStore,
  entityType: NoteEntityType,
  entityId: string,
): boolean {
  const noteId = useEntityNoteId(store, entityType, entityId);
  // Subscribe to the entire row so that any cell change (notably the body)
  // re-renders callers. Reading the cell is incidental; the subscription is
  // what keeps the indicator in sync.
  useRow(TABLES.notes, noteId ?? '', store);
  if (!noteId) return false;
  const body = String(store.getCell(TABLES.notes, noteId, COLUMNS.notes.body) ?? '');
  return body.trim().length > 0;
}