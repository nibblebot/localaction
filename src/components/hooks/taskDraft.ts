/**
 * Deferred task creation ("draft row") — the app-wide pending draft.
 *
 * Every add-task affordance (a view's add-task "+", a row's "Add sub-task",
 * Shift+Enter quick entry) requests a draft here instead of creating an
 * empty task in the store. The task trees splice the draft's node into
 * their render order (see `spliceTaskDraft`) and render it as a static
 * row; the store is only touched when the user commits (Enter or blur
 * with non-empty text) inside `TaskDraftRow`.
 *
 * One draft exists app-wide at a time; requesting a new draft replaces
 * the old. Each request gets a UNIQUE node id (`task-draft:<n>`) so the
 * row remounts on Shift+Enter chains — the focus effect and empty text
 * state reset instead of leaking into the next entry.
 *
 * Pure view state: kept out of the TinyBase store, so an open draft
 * never syncs, never bumps a count, and never lands in undo history.
 */
import { useSyncExternalStore } from 'react';
import type { TaskPlacement } from '../../data/index.ts';
import type { SortableTreeNode } from '../dnd/SortableTree.tsx';

/** Node-id prefix marking a draft row inside the task trees. */
export const TASK_DRAFT_NODE_PREFIX = 'task-draft:';

/** True when a flattened-tree id belongs to the pending draft row. */
export function isTaskDraftNodeId(id: string): boolean {
  return id.startsWith(TASK_DRAFT_NODE_PREFIX);
}

/**
 * Where the committed task will land. Exactly one field is set:
 * `placement` appends at the end of that group; `afterId` inserts as
 * the next sibling after the anchor task (Shift+Enter quick entry).
 */
export interface TaskDraftRequest {
  placement?: TaskPlacement;
  afterId?: string;
}

/** A requested draft plus the unique node id it renders under. */
export interface PendingTaskDraft extends TaskDraftRequest {
  nodeId: string;
}

let counter = 0;
let pending: PendingTaskDraft | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/**
 * Open a draft row for `req`, replacing any draft already open. The
 * module counter guarantees a fresh node id per request so the draft
 * row remounts (and refocuses) even when the new request lands where
 * the old one was.
 */
export function requestTaskDraft(req: TaskDraftRequest): void {
  counter += 1;
  pending = { nodeId: `${TASK_DRAFT_NODE_PREFIX}${counter}`, ...req };
  emit();
}

/** Close the open draft without creating anything. No-op when closed. */
export function cancelTaskDraft(): void {
  if (pending === null) return;
  pending = null;
  emit();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The currently open draft, or null. Stable identities between emits. */
export function usePendingTaskDraft(): PendingTaskDraft | null {
  return useSyncExternalStore(
    subscribe,
    () => pending,
    () => null,
  );
}

function placementMatches(a: TaskPlacement, b: TaskPlacement): boolean {
  if (a.kind !== b.kind) return false;
  // Kinds are equal; 'inbox' carries no id, every other kind does.
  return a.kind === 'inbox' || a.id === (b as { id: string }).id;
}

/** DFS: insert `draftNode` directly after `targetId` among its siblings. */
function insertAfterId(
  nodes: readonly SortableTreeNode<string>[],
  targetId: string,
  draftNode: SortableTreeNode<string>,
): readonly SortableTreeNode<string>[] | null {
  const idx = nodes.findIndex((n) => n.id === targetId);
  if (idx >= 0) {
    return [...nodes.slice(0, idx + 1), draftNode, ...nodes.slice(idx + 1)];
  }
  for (let i = 0; i < nodes.length; i += 1) {
    const child = insertAfterId(nodes[i]!.children, targetId, draftNode);
    if (child !== null) {
      const copy = [...nodes];
      copy[i] = { ...nodes[i]!, children: child };
      return copy;
    }
  }
  return null;
}

/** DFS: append `draftNode` to the children of `targetId`. */
function appendChildOf(
  nodes: readonly SortableTreeNode<string>[],
  targetId: string,
  draftNode: SortableTreeNode<string>,
): readonly SortableTreeNode<string>[] | null {
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i]!;
    if (n.id === targetId) {
      const copy = [...nodes];
      copy[i] = { ...n, children: [...n.children, draftNode] };
      return copy;
    }
    const child = appendChildOf(n.children, targetId, draftNode);
    if (child !== null) {
      const copy = [...nodes];
      copy[i] = { ...n, children: child };
      return copy;
    }
  }
  return null;
}

/**
 * Copy-on-write splice of the pending draft into a task tree's render
 * order. Returns the ORIGINAL array reference when the draft does not
 * belong in this tree (memo identities survive; no re-render churn):
 *
 * - `afterId`       → inserted directly after the anchor task among its
 *                     siblings (DFS at any depth).
 * - kind `'task'`   → appended to the end of that task's children (DFS).
 * - other placements → appended at the tree's root, only when kind+id
 *                     match `rootPlacement` (the tree's own group).
 */
export function spliceTaskDraft(
  nodes: readonly SortableTreeNode<string>[],
  draft: PendingTaskDraft,
  rootPlacement?: TaskPlacement,
): readonly SortableTreeNode<string>[] {
  const draftNode: SortableTreeNode<string> = { id: draft.nodeId, children: [] };
  if (draft.afterId !== undefined) {
    return insertAfterId(nodes, draft.afterId, draftNode) ?? nodes;
  }
  const placement = draft.placement;
  if (placement === undefined) return nodes;
  if (placement.kind === 'task') {
    return appendChildOf(nodes, placement.id, draftNode) ?? nodes;
  }
  if (rootPlacement !== undefined && placementMatches(placement, rootPlacement)) {
    return [...nodes, draftNode];
  }
  return nodes;
}
