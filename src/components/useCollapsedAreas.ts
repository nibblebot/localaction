import { useCallback, useState } from 'react';

const STORAGE_KEY = 'localaction.sidebar.collapsedAreaIds';

function loadStored(): ReadonlySet<string> {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function persist(ids: ReadonlySet<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage may be unavailable (private mode); degrade silently.
  }
}

export interface CollapsedAreas {
  /** Ids of areas whose sub-areas are currently hidden. */
  readonly collapsed: ReadonlySet<string>;
  /** Flip one area between collapsed and expanded. */
  readonly toggle: (id: string) => void;
  /** Expand one area; no-op when it is already expanded. */
  readonly expand: (id: string) => void;
  /** Replace the whole set (used by collapse-all / expand-all). */
  readonly replace: (ids: Iterable<string>) => void;
}

/**
 * Sidebar area collapse state. Pure view state — kept out of the
 * TinyBase store so it never syncs; persisted to localStorage like
 * the person filter so it survives reloads on this device.
 */
export function useCollapsedAreas(): CollapsedAreas {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(loadStored);

  const toggle = useCallback((id: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
      return next;
    });
  }, []);

  const expand = useCallback((id: string): void => {
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      persist(next);
      return next;
    });
  }, []);

  const replace = useCallback((ids: Iterable<string>): void => {
    const next = new Set(ids);
    persist(next);
    setCollapsed(next);
  }, []);

  return { collapsed, toggle, expand, replace };
}
