import { useCallback, useState } from 'react';

function loadStored(storageKey: string): ReadonlySet<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function persist(storageKey: string, ids: ReadonlySet<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey, JSON.stringify([...ids]));
  } catch {
    // localStorage may be unavailable (private mode); degrade silently.
  }
}

export interface CollapsedSet {
  /** Ids of entities currently collapsed. */
  readonly collapsed: ReadonlySet<string>;
  /** Flip one entity between collapsed and expanded. */
  readonly toggle: (id: string) => void;
  /** Expand one entity; no-op when it is already expanded. */
  readonly expand: (id: string) => void;
  /** Replace the whole set (used by collapse-all / expand-all). */
  readonly replace: (ids: Iterable<string>) => void;
}

/**
 * LocalStorage-backed collapse state for a set of entities. Pure view
 * state — kept out of the TinyBase store so it never syncs; persisted
 * to localStorage like the person filter so it survives reloads on
 * this device. An empty set means everything is expanded.
 */
export function useCollapsedSet(storageKey: string): CollapsedSet {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => loadStored(storageKey));

  const toggle = useCallback(
    (id: string): void => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        persist(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const expand = useCallback(
    (id: string): void => {
      setCollapsed((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        persist(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const replace = useCallback(
    (ids: Iterable<string>): void => {
      const next = new Set(ids);
      persist(storageKey, next);
      setCollapsed(next);
    },
    [storageKey],
  );

  return { collapsed, toggle, expand, replace };
}
