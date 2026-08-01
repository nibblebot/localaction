import { useCollapsedSet } from './useCollapsedSet.ts';
import type { CollapsedSet } from './useCollapsedSet.ts';

/**
 * Area-view section collapse state — which top-level sections (Area
 * tasks / Projects / Notes) hide their body. Keys are the stable
 * section ids ('tasks' | 'projects' | 'notes'); unlike project ids
 * they repeat across areas, so the preference is global to the view.
 * Pure view state, device-local, never synced.
 */
export function useCollapsedSections(): CollapsedSet {
  return useCollapsedSet('localaction.area.collapsedSections');
}
