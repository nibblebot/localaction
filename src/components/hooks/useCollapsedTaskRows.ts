import { useCollapsedSet } from './useCollapsedSet.ts';
import type { CollapsedSet } from './useCollapsedSet.ts';

/**
 * Task-tree row collapse state — which parent tasks hide their
 * subtree. Keys are task ids (unique app-wide). Pure view state,
 * device-local, never synced.
 */
export function useCollapsedTaskRows(): CollapsedSet {
  return useCollapsedSet('localaction.taskTree.collapsedTaskIds');
}
