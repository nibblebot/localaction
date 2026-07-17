import { useRow, useRowIds } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, SELF_PERSON_ID, TABLES } from './schema.ts';
import { nowIso, row } from './internal.ts';
import type { Person, PersonInput, PersonPatch } from './types.ts';

/**
 * Word-initials derivation rule (ticket 02):
 *   first + last word, max 2, uppercased; empty/whitespace -> "?".
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  const out = (first + last).toUpperCase();
  return out.length > 0 ? out : '?';
}

/**
 * Stable 32-bit hash used to derive a person's default hue from their
 * name. Same algorithm as `order.ts`'s `idHash` so the two helpers stay
 * consistent (FNV-style `h = h*31 + c`).
 */
function nameHash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return h;
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number): string => {
    const c =
      lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Name-derived default color: stable across reload and sync. Same
 * deterministic hue for the same name; the Slack/Discord default-
 * avatar pattern. Applies to Self (whose "specialness" is structural,
 * not chromatic).
 */
export function nameDerivedHue(name: string): string {
  const h = nameHash(name);
  return hslToHex(h % 360, 55, 55);
}

export function createPerson(
  store: MergeableStore,
  input: PersonInput,
): string {
  const trimmed = input.name.trim();
  if (trimmed.length === 0) {
    throw new Error('createPerson: name must be non-empty');
  }
  const id =
    trimmed === 'Self' && !store.hasRow(TABLES.persons, SELF_PERSON_ID)
      ? SELF_PERSON_ID
      : makePersonId();
  const color = input.color?.trim() || nameDerivedHue(trimmed);
  const ts = nowIso();
  store.setRow(
    TABLES.persons,
    id,
    row({
      [COLUMNS.persons.name]: trimmed,
      [COLUMNS.persons.color]: color,
      [COLUMNS.persons.createdAt]: ts,
      [COLUMNS.persons.updatedAt]: ts,
    }),
  );
  return id;
}

export function updatePerson(
  store: MergeableStore,
  id: string,
  patch: PersonPatch,
): void {
  if (!store.hasRow(TABLES.persons, id)) return;
  const next: Record<string, string | undefined> = {
    [COLUMNS.persons.updatedAt]: nowIso(),
  };
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (trimmed.length > 0) next[COLUMNS.persons.name] = trimmed;
  }
  if (patch.color !== undefined) {
    const c = patch.color.trim();
    if (c.length > 0) next[COLUMNS.persons.color] = c;
  }
  store.setPartialRow(TABLES.persons, id, row(next));
}

/**
 * Delete a non-Self person. Self is non-deletable (I6): calls targeting
 * Self are a no-op. Associated link rows are NOT rewritten here — they
 * fall out at read time via the cast ∩ persons intersection (I9).
 */
export function deletePerson(store: MergeableStore, id: string): void {
  if (id === SELF_PERSON_ID) return;
  if (!store.hasRow(TABLES.persons, id)) return;
  store.delRow(TABLES.persons, id);
}

export function getPerson(
  store: MergeableStore,
  id: string,
): Person | undefined {
  const r = store.getRow(TABLES.persons, id);
  if (!r || Object.keys(r).length === 0) return undefined;
  return {
    id,
    name: String(r[COLUMNS.persons.name] ?? ''),
    color: String(r[COLUMNS.persons.color] ?? ''),
    createdAt: String(r[COLUMNS.persons.createdAt] ?? ''),
    updatedAt: String(r[COLUMNS.persons.updatedAt] ?? ''),
  };
}

export function usePerson(
  store: MergeableStore,
  id: string | undefined,
): Person | undefined {
  const r = useRow(TABLES.persons, id ?? '', store);
  if (!id || !r || Object.keys(r).length === 0) return undefined;
  return {
    id,
    name: String(r[COLUMNS.persons.name] ?? ''),
    color: String(r[COLUMNS.persons.color] ?? ''),
    createdAt: String(r[COLUMNS.persons.createdAt] ?? ''),
    updatedAt: String(r[COLUMNS.persons.updatedAt] ?? ''),
  };
}

export function useAllPersonIds(store: MergeableStore): string[] {
  return useRowIds(TABLES.persons, store);
}

/**
 * Idempotent Self bootstrap. Called from `DataLayerProvider`'s effect
 * alongside `backfillOrder()`. The fixed literal id `"self"` is what
 * makes every device's Self converge to the same row over sync — a
 * generated UUID could not. This is a bootstrap, not a migration
 * (I10): existing rows already derive to `{Self}` at read time; this
 * just gives that fallback a real name and color to render.
 */
export function ensureSelfPerson(store: MergeableStore): void {
  if (store.hasRow(TABLES.persons, SELF_PERSON_ID)) return;
  const ts = nowIso();
  store.setRow(
    TABLES.persons,
    SELF_PERSON_ID,
    row({
      [COLUMNS.persons.name]: 'Self',
      [COLUMNS.persons.color]: nameDerivedHue('Self'),
      [COLUMNS.persons.createdAt]: ts,
      [COLUMNS.persons.updatedAt]: ts,
    }),
  );
}

function makePersonId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
