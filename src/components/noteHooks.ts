/**
 * Reactive read helpers for Note rows.
 *
 * Lifted out of `NoteEditor.tsx` so the component file only exports
 * components (keeps `react/only-export-components` clean for fast-refresh).
 */

import { useRow, useRowIds } from 'tinybase/ui-react';
import {
  useDataLayer,
  getNote,
  getNoteBySlug,
  COLUMNS,
  TABLES,
  NOTE_ENTITY_TYPE,
} from '../data/index.ts';
import type { NoteEntityType } from '../data/index.ts';

export function useNoteReactive(
  store: ReturnType<typeof useDataLayer>['store'],
  id: string,
): ReturnType<typeof getNote> {
  const row = useRow(TABLES.notes, id, store);
  if (!row || Object.keys(row).length === 0) return undefined;
  return {
    id,
    slug: String(row[COLUMNS.notes.slug] ?? ''),
    title: String(row[COLUMNS.notes.title] ?? ''),
    body: String(row[COLUMNS.notes.body] ?? ''),
    entityType: String(row[COLUMNS.notes.entityType] ?? NOTE_ENTITY_TYPE.domain) as NoteEntityType,
    entityId: String(row[COLUMNS.notes.entityId] ?? ''),
    createdAt: String(row[COLUMNS.notes.createdAt] ?? ''),
    updatedAt: String(row[COLUMNS.notes.updatedAt] ?? ''),
  };
}

/** Resolve a note slug to its id (for deep links). */
export function useNoteIdForSlug(slug: string | undefined): string | undefined {
  const { store } = useDataLayer();
  // Re-render when the notes table changes so a newly-created note resolves.
  useRowIds(TABLES.notes, store);
  if (!slug) return undefined;
  return getNoteBySlug(store, slug)?.id;
}