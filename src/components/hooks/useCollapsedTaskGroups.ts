import { useCollapsedSet } from './useCollapsedSet.ts';
import type { CollapsedSet } from './useCollapsedSet.ts';

/**
 * Area/inbox root-task group collapse state — which tri-state groups
 * (Active / Backlog / Done) hide their rows. Keys are the stable group
 * ids ('active' | 'backlog' | 'done'); they repeat across areas, so
 * the preference is global to the view. Pure view state, device-local,
 * never synced.
 */
export function useCollapsedTaskGroups(): CollapsedSet {
  return useCollapsedSet('localaction.area.collapsedTaskGroups');
}