import type { Row, MergeableStore } from 'tinybase';
import { useTables } from 'tinybase/ui-react';
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

export function useStoreVersion(store: MergeableStore): void {
  useTables(store);
}

export { TABLES, COLUMNS };