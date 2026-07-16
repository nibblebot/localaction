import { useRow, useRowIds } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES, NOTE_ENTITY_TYPE } from './schema.ts';
import type { NoteEntityType } from './schema.ts';
import { newId, nowIso, row } from './internal.ts';
import { slugify } from './slug.ts';
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

export function updateNote(store: MergeableStore, id: string, patch: NotePatch): void {
  if (!store.hasRow(TABLES.notes, id)) return;
  const next: Record<string, string | undefined> = {
    [COLUMNS.notes.updatedAt]: nowIso(),
  };
  if (patch.body !== undefined) next[COLUMNS.notes.body] = patch.body;
  if (patch.title !== undefined) {
    next[COLUMNS.notes.title] = patch.title;
    next[COLUMNS.notes.slug] = uniqueSlug(store, patch.title, id);
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
    entityType: String(r[COLUMNS.notes.entityType] ?? NOTE_ENTITY_TYPE.area) as NoteEntityType,
    entityId: String(r[COLUMNS.notes.entityId] ?? ''),
    createdAt: String(r[COLUMNS.notes.createdAt] ?? ''),
    updatedAt: String(r[COLUMNS.notes.updatedAt] ?? ''),
  };
}

export function useNote(store: MergeableStore, id: string | undefined): Note | undefined {
  const r = useRow(TABLES.notes, id ?? '', store);
  if (!id || !r || Object.keys(r).length === 0) return undefined;
  return {
    id,
    slug: String(r[COLUMNS.notes.slug] ?? ''),
    title: String(r[COLUMNS.notes.title] ?? ''),
    body: String(r[COLUMNS.notes.body] ?? ''),
    entityType: String(r[COLUMNS.notes.entityType] ?? NOTE_ENTITY_TYPE.area) as NoteEntityType,
    entityId: String(r[COLUMNS.notes.entityId] ?? ''),
    createdAt: String(r[COLUMNS.notes.createdAt] ?? ''),
    updatedAt: String(r[COLUMNS.notes.updatedAt] ?? ''),
  };
}

export function useAllNoteIds(store: MergeableStore): string[] {
  return useRowIds(TABLES.notes, store);
}

/**
 * Reactive: ids of notes attached to a single entity (e.g. one project).
 * Subscribes to the notes table so any change re-renders callers.
 */
export function useNoteIdsForEntity(
  store: MergeableStore,
 entityType: NoteEntityType,
  entityId: string,
): string[] {
  useRowIds(TABLES.notes, store);
  const out: string[] = [];
  for (const id of store.getRowIds(TABLES.notes)) {
    if (
      store.getCell(TABLES.notes, id, COLUMNS.notes.entityType) !== entityType
    )
      continue;
    if (store.getCell(TABLES.notes, id, COLUMNS.notes.entityId) !== entityId) continue;
    out.push(id);
  }
  return out;
}
