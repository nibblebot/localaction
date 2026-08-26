import { createContext, useContext } from 'react';

/**
 * The tree's live drag state, published so an outer context can light
 * up its own drop targets while a row inside a `SortableTree` is in
 * flight. Hoisted contexts (e.g. the task-group drop zones) mount a
 * `ContextDndMonitor` around each tree to learn the active id, then
 * read the current hover target from this context. Lives in its own
 * file so `SortableTree.tsx` keeps exporting only components (Fast
 * Refresh).
 */
export interface DndTarget {
  /** The row currently being dragged, or null when idle. */
  activeId: string | null;
  /** The row currently under the pointer, or null when idle. */
  overId: string | null;
}

/** Default value: no drag in flight. */
const DEFAULT_DND_TARGET: DndTarget = { activeId: null, overId: null };

export const DndTargetContext = createContext<DndTarget>(DEFAULT_DND_TARGET);

/** Read the enclosing tree's live drag state (idle when none). */
export function useDndTarget(): DndTarget {
  return useContext(DndTargetContext);
}
