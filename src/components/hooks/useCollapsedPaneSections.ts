import { useCollapsedSet } from './useCollapsedSet.ts';
import type { CollapsedSet } from './useCollapsedSet.ts';

/**
 * Area-view pane-section collapse state — which top-level pane sections
 * (Notes) hide their body. Keys are stable section ids ('notes'); they
 * repeat across areas, so the preference is global to the view. Pure view
 * state, device-local, never synced.
 */
export function useCollapsedPaneSections(): CollapsedSet {
  return useCollapsedSet('localaction.area.collapsedPaneSections');
}