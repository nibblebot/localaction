import { useCallback, useEffect, useState } from 'react';

export const SIDEBAR_MIN_PX = 200;
export const SIDEBAR_MAX_PX = 260;
/** Width applied until the user resizes (nothing stored yet). */
export const SIDEBAR_DEFAULT_PX = 240;
const STORAGE_KEY = 'localaction:sidebar-w';

function loadStored(): number {
  if (typeof localStorage === 'undefined') return SIDEBAR_DEFAULT_PX;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SIDEBAR_DEFAULT_PX;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return SIDEBAR_DEFAULT_PX;
    return Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, n));
  } catch {
    return SIDEBAR_DEFAULT_PX;
  }
}

function persist(px: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, String(px));
  } catch {
    /* localStorage may be unavailable (private mode); degrade silently. */
  }
}

/** Clamp px into [SIDEBAR_MIN_PX, SIDEBAR_MAX_PX]. Exported for callers
 * that need to validate a candidate before applying it. */
export function clampSidebarWidth(px: number): number {
  return Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, Math.round(px)));
}

function applyToRoot(px: number): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--sidebar-w', `${px}px`);
}

export interface SidebarWidth {
  /** Current committed sidebar width in pixels (always within [MIN, MAX]). */
  readonly width: number;
  /** Minimum allowed width, in pixels. */
  readonly min: number;
  /** Maximum allowed width, in pixels. */
  readonly max: number;
  /** Commit a new width: clamp, persist, and update the CSS var. */
  readonly setWidth: (px: number) => void;
  /** Write a candidate width to the CSS var only — no state, no
   * persist, no re-render. Drag handlers use this on every move event
   * and call setWidth() once on pointerup to commit. */
  readonly applyTransientWidth: (px: number) => void;
}

/**
 * Sidebar width — pure view state, persisted to localStorage like
 * collapse state so it survives reloads on this device. Not synced:
 * width is a per-screen preference, not data.
 *
 * The committed width drives `--sidebar-w` on the document root,
 * which `.app-shell`'s grid template already consumes.
 */
export function useSidebarWidth(): SidebarWidth {
  const [width, setWidthState] = useState<number>(() => loadStored());

  // Apply the committed width to the document root so the existing
  // grid template reads the live value. During a drag the move handler
  // overwrites this directly, and the next render after pointerup
  // re-syncs the same value (cheap and idempotent).
  useEffect(() => {
    applyToRoot(width);
  }, [width]);

  const setWidth = useCallback((px: number): void => {
    const next = clampSidebarWidth(px);
    setWidthState(next);
    persist(next);
  }, []);

  const applyTransientWidth = useCallback((px: number): void => {
    applyToRoot(clampSidebarWidth(px));
  }, []);

  return {
    width,
    min: SIDEBAR_MIN_PX,
    max: SIDEBAR_MAX_PX,
    setWidth,
    applyTransientWidth,
  };
}
