import { useCollapsedSet } from './useCollapsedSet.ts';
import type { CollapsedSet } from './useCollapsedSet.ts';

/**
 * Per-project empty-section visibility — which project cards prune
 * section headers that have no visible tasks under them. One global
 * key is correct: project ids are unique across areas. Pure view
 * state, device-local, never synced.
 */
export function useHiddenEmptySections(): CollapsedSet {
  return useCollapsedSet('localaction.area.hiddenEmptySectionProjectIds');
}
