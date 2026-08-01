import { useCollapsedSet } from './useCollapsedSet.ts';
import type { CollapsedSet } from './useCollapsedSet.ts';

/**
 * Area-view project collapse state — which project cards hide their
 * task tree. One global key is correct: project ids are unique across
 * areas. Pure view state, device-local, never synced.
 */
export function useCollapsedProjects(): CollapsedSet {
  return useCollapsedSet('localaction.area.collapsedProjectIds');
}
