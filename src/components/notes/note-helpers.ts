import type { MergeableStore } from 'tinybase';
import { TABLES, COLUMNS, NOTE_ENTITY_TYPE } from '../../data/index.ts';

export function stripPreview(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return '';
  const first = trimmed.split('\n', 1)[0] ?? '';
  return first.length > 140 ? `${first.slice(0, 140)}…` : first;
}

export function collectNoteIds(
  store: MergeableStore,
  projectId: string,
  out: string[],
): void {
  for (const id of store.getRowIds(TABLES.notes)) {
    if (store.getCell(TABLES.notes, id, COLUMNS.notes.entityType) !== NOTE_ENTITY_TYPE.project) continue;
    if (store.getCell(TABLES.notes, id, COLUMNS.notes.entityId) !== projectId) continue;
    out.push(id);
  }
}
