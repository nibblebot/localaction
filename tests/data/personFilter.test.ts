/**
 * The person filter is localStorage-backed React state. This test
 * confirms the storage shape and that load/persist round-trips.
 */
import { describe, expect, it, beforeEach } from 'vitest';

const STORAGE_KEY = 'localaction.personFilter.v1';

// In-memory shim used when localStorage is not available in the
// test environment (some jsdom configs do not expose it on
// `globalThis`). Real consumers (the React context) gate on
// `typeof localStorage === 'undefined'` so this is safe to swap.
let store: Record<string, string> = {};
const ls = {
  getItem: (k: string): string | null => (k in store ? store[k]! : null),
  setItem: (k: string, v: string): void => {
    store[k] = v;
  },
  removeItem: (k: string): void => {
    delete store[k];
  },
  clear: (): void => {
    store = {};
  },
  key: (i: number): string | null => Object.keys(store)[i] ?? null,
  get length(): number {
    return Object.keys(store).length;
  },
};
(globalThis as unknown as { localStorage: typeof ls }).localStorage = ls;
function loadStored(): string[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((x): x is string => typeof x === 'string');
}

function persist(ids: readonly string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

describe('person filter storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns an empty list when nothing is stored', () => {
    expect(loadStored()).toEqual([]);
  });

  it('round-trips a list of person ids', () => {
    persist(['self', 'mom']);
    expect(loadStored()).toEqual(['self', 'mom']);
  });

  it('drops non-string entries on read (defensive)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['self', 42, null, 'mom']));
    expect(loadStored()).toEqual(['self', 'mom']);
  });

  it('drops non-array JSON values (defensive)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ self: true }));
    expect(loadStored()).toEqual([]);
  });

  it('returns an empty list when JSON is malformed', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    expect(loadStored()).toEqual([]);
  });

  it('persists an empty list as an empty array', () => {
    persist([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('[]');
    expect(loadStored()).toEqual([]);
  });
});
