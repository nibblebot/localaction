import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'localaction.main.showCompleted';

/** Shown by default: completed tasks render in place / in the Done group. */
function loadStored(): boolean {
  if (typeof localStorage === 'undefined') return true;
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

// Module-level so every pane on this device reads one preference and
// re-renders together when it flips — AreaView and the task detail pane
// both mount this hook for the same value.
let current = loadStored();
const listeners = new Set<() => void>();

function setCurrent(next: boolean): void {
  if (next === current) return;
  current = next;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // localStorage may be unavailable (private mode); degrade silently.
    }
  }
  for (const l of listeners) l();
}

export interface ShowCompleted {
  /** True when completed tasks render (Done group, strikethrough rows). */
  readonly showCompleted: boolean;
  /** Flip between hiding completed tasks and showing them. */
  readonly toggle: () => void;
}

/**
 * Completed-task visibility for the detail pane (area view and task
 * detail pane). Pure view state — kept out of the TinyBase store so it
 * never syncs; shared by every pane on this device and persisted to
 * localStorage so it survives reloads.
 */
export function useShowCompleted(): ShowCompleted {
  const showCompleted = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    () => current,
  );
  const toggle = useCallback(() => setCurrent(!current), []);
  return { showCompleted, toggle };
}
