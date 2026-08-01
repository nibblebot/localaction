import { useCollapsedSet } from './useCollapsedSet.ts';
import type { CollapsedSet } from './useCollapsedSet.ts';

/**
 * Per-project empty-section visibility — the project cards that KEEP
 * section headers with no visible tasks under them. One global key is
 * correct: project ids are unique across areas. Pure view state,
 * device-local, never synced.
 *
 * Empty section headers are hidden by default: a project id only
 * enters the set when the user opts to show its empty sections.
 */
export function useShowEmptySections(): CollapsedSet {
  return useCollapsedSet('localaction.area.showEmptySectionProjectIds');
}
