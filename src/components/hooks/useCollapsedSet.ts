import { useCallback, useEffect, useState } from 'react';

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
 * to localStorage so it survives reloads on this device. An empty set
 * means everything is expanded.
 */
export function useCollapsedSet(storageKey: string): CollapsedSet {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => loadStored(storageKey));

  // Persist on commit, not inside the state updater: React updaters must
  // stay pure (StrictMode double-invokes them), so the write lives in an
  // effect keyed to the committed set. `storageKey` is expected to be
  // stable for the lifetime of this instance — the lazy initializer loads
  // the right set on mount; a key that changes mid-life is not resynced.
  useEffect(() => {
    persist(storageKey, collapsed);
  }, [collapsed, storageKey]);

  const toggle = useCallback((id: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expand = useCallback((id: string): void => {
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const replace = useCallback((ids: Iterable<string>): void => {
    setCollapsed(new Set(ids));
  }, []);

  return { collapsed, toggle, expand, replace };
}
