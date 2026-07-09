import type { MergeableStore } from 'tinybase';
import { useRowIds } from 'tinybase/ui-react';
import { COLUMNS, TABLES } from './schema.ts';

const TAG_REGEX = /(?:^|[\s([])#([a-z0-9][a-z0-9_-]*)/gi;

export function extractTags(text: string): string[] {
  const out: string[] = [];
  if (!text) return out;
  for (const match of text.matchAll(TAG_REGEX)) {
    const tag = match[1].toLowerCase();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

export interface TagCount {
  tag: string;
  count: number;
}

function computeTagCounts(ids: string[], store: MergeableStore): TagCount[] {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const body = String(store.getCell(TABLES.notes, id, COLUMNS.notes.body) ?? '');
    for (const tag of extractTags(body)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count - a.count) || a.tag.localeCompare(b.tag));
}

export function getAllTagCounts(store: MergeableStore): TagCount[] {
  return computeTagCounts(store.getRowIds(TABLES.notes), store);
}

export function getNoteIdsForTag(store: MergeableStore, tag: string): string[] {
  const want = tag.toLowerCase();
  return store.getRowIds(TABLES.notes).filter((id) => {
    const body = String(store.getCell(TABLES.notes, id, COLUMNS.notes.body) ?? '');
    return extractTags(body).includes(want);
  });
}

export function useAllTagCounts(store: MergeableStore): TagCount[] {
  // useRowIds subscribes the component to row-list changes in the notes table.
  // Must be called from an always-mounted component for the subscription to
  // survive when no notes are present yet.
  const ids = useRowIds(TABLES.notes, store);
  return computeTagCounts(ids, store);
}

export function useNoteIdsForTag(store: MergeableStore, tag: string): string[] {
  const ids = useRowIds(TABLES.notes, store);
  const want = tag.toLowerCase();
  return ids.filter((id) => {
    const body = String(store.getCell(TABLES.notes, id, COLUMNS.notes.body) ?? '');
    return extractTags(body).includes(want);
  });
}
