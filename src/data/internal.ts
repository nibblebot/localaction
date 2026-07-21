import { useEffect, useState } from 'react';
import type { Row, MergeableStore } from 'tinybase';
import { TABLES, COLUMNS } from './schema.ts';

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function row(
  cells: Record<string, string | number | boolean | null | undefined>,
): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(cells)) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

export function normalizeRelation(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

/**
 * Numeric token that increments whenever the given table changes —
 * the narrow replacement for ui-react's `useTables`, which
 * deep-compares the ENTIRE tables object on every transaction
 * (measured at ~2s of main-thread `objIsEqual` per cell edit with
 * 600 task rows, 2026-07 audit). A table listener costs a counter
 * increment instead.
 *
 * Pass the token as the `_version` argument of the imperative
 * selectors (getAreaCounts et al.) so React Compiler invalidates
 * their memoised results exactly when source data changes. The
 * re-render semantics match `useTables` — any change to the watched
 * table re-renders the subscriber. Multi-table derivations sum
 * several calls (fixed hook order, complete deps):
 *
 *   const v = useTableVersion(store, TABLES.persons)
 *           + useTableVersion(store, TABLES.person_links);
 */
export function useTableVersion(store: MergeableStore, tableId: string): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = (): void => setVersion((v) => v + 1);
    const listenerId = store.addTableListener(tableId, bump);
    return () => {
      store.delListener(listenerId);
    };
  }, [store, tableId]);
  return version;
}

export { TABLES, COLUMNS };