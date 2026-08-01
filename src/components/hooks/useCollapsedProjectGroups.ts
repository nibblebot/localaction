import { useCollapsedSet } from './useCollapsedSet.ts';
import type { CollapsedSet } from './useCollapsedSet.ts';

/**
 * Area-view project status-group collapse state — which status groups
 * (Active / Backlog / Done) hide their rows. Keys are the stable group
 * ids ('active' | 'backlog' | 'done'); like the pane sections they
 * repeat across areas and sub-areas, so the preference is global to
 * the view. Pure view state, device-local, never synced.
 */
export function useCollapsedProjectGroups(): CollapsedSet {
  return useCollapsedSet('localaction.area.collapsedProjectGroups');
}
