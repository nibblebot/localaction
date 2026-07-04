/**
 * Pure helpers shared across the data-layer action creators.
 *
 * These keep side-effecting code (IDs, timestamps, slug derivation) out of the
 * React hooks and out of the action creators themselves so they can be unit
 * tested in isolation. See `src/data/README.md` for the seam contract.
 *
 * `nowIso()` returns a UTC ISO string. TinyBase's `MergeableStore` layers its
 * own HLC on top of row writes for sync ordering, but the app still records a
 * human-readable `createdAt` / `updatedAt` per row (see the PRD schema).
 */

import type { Row } from 'tinybase';
import { TABLES, COLUMNS } from './schema.ts';

/** Generate a fresh, collision-resistant row id. */
export function newId(): string {
  // `crypto.randomUUID` is available in browser contexts, Node 19+, and jsdom.
  // Fallback to a timestamp+random blob keeps the helper usable in older
  // runtimes without taking on an `uuid` dependency.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Current time as an ISO-8601 UTC string. Inject-able for tests via a shim. */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Build a TinyBase `Row` from a partial map, dropping `undefined` and `null`.
 *
 * TinyBase's `Cell` type is `string | number | boolean | null | object` — it
 * does not include `undefined`. Optional relation columns (e.g. `parentId`)
 * are therefore stored *absent* (the cell key omitted) rather than as `null`
 * or `undefined`. This keeps reads uniform: an unset relation reads back as
 * `undefined` from `getCell`, normalised to `null` by `normalizeRelation`,
 * and filters can branch on the single `=== undefined` predicate. No entity
 * in this app stores a legitimate `null` cell — every nullable column is a
 * relation — so stripping `null` here is safe and intentional.
 */
export function row(
  cells: Record<string, string | number | boolean | null | undefined>,
): Row {
  const out: Row = {};
  for (const [key, value] of Object.entries(cells)) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

/**
 * Coerce a raw TinyBase cell into a `string | null` relation value.
 *
 * Absent (`undefined`), empty, or explicitly-null cells all normalise to
 * `null` so entity consumers branch on a single sentinel.
 */
export function normalizeRelation(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

/** Re-export the schema constants so entity modules don't import schema twice. */
export { TABLES, COLUMNS };