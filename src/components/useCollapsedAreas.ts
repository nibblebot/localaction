import { useCollapsedSet } from './useCollapsedSet.ts';
import type { CollapsedSet } from './useCollapsedSet.ts';

export type CollapsedAreas = CollapsedSet;

/**
 * Sidebar area collapse state. Pure view state — kept out of the
 * TinyBase store so it never syncs; persisted to localStorage like
 * the person filter so it survives reloads on this device.
 */
export function useCollapsedAreas(): CollapsedAreas {
  return useCollapsedSet('localaction.sidebar.collapsedAreaIds');
}
