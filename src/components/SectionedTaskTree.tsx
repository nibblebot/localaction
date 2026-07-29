/**
 * Project task tree with Sections — one flattened SortableTree spans the
 * unsectioned group plus every section block, so a single drag can
 * reorder tasks, nest sub-tasks, move tasks between groups, and reorder
 * the sections themselves.
 *
 * Model: the tree's root level holds the project's unsectioned top-level
 * tasks first, then one node per section whose children are the
 * section's top-level tasks. Section node ids use the placement
 * encoding `section:<id>` (task ids are UUIDs, so they never collide),
 * which makes a task's drop parent a ready-made placement string.
 *
 * Drop semantics:
 * - Task dropped at depth 0 → unsectioned (`project:<id>` placement).
 *   A drop right before a section header lands at the END of the
 *   unsectioned group — sections are never task siblings.
 * - Task dropped under a section header → `section:<id>` placement.
 * - Task dropped under a task → `task:<id>` (sub-task, unchanged).
 * - Section dropped anywhere → reordered among sections. Sections are
 *   pinned to depth 0 via `maxDepthOf`; a drop into the unsectioned
 *   block makes the dragged section the first section.
 *
 * Every section renders — empty ones included — so the area rollup
 * matches the project view, unless `hideEmptySections` is set (the
 * Today view), which skips sections with no visible tasks.
 */
import { useState } from 'react';
import type { MergeableStore } from 'tinybase';
import {
  useDataLayer,
  useSection,
  useSectionIdsForProject,
  createTask,
  updateSection,
  deleteSection,
  captureSubtree,
  restoreSubtree,
  moveSection,
  moveTask,
  buildTaskTree,
  pruneDoneTasks,
  getPlacement,
  encodePlacement,
  PLACEMENT_SEP,
  TABLES,
  TOMBSTONE_ENTITY_TYPE,
} from '../data/index.ts';
import type { TaskTreeNode } from '../data/index.ts';
import { SortableTree } from './SortableTree.tsx';
import type { SortableTreeNode } from './SortableTree.tsx';
import type { SortableHandleProps } from './SortableList.tsx';
import { TaskRow } from './TaskList.tsx';
import { queueTaskTitleFocus, consumeSectionTitleFocus } from './taskTitleFocus.ts';
import { useUndo } from './useUndo.ts';
import EditableTitle from './EditableTitle.tsx';
import ConfirmModal from './ConfirmModal.tsx';

const SECTION_NODE_PREFIX = `section${PLACEMENT_SEP}`;

function sectionNodeId(sectionId: string): string {
  return `${SECTION_NODE_PREFIX}${sectionId}`;
}

function decodeSectionNodeId(id: string): string | null {
  return id.startsWith(SECTION_NODE_PREFIX)
    ? id.slice(SECTION_NODE_PREFIX.length)
    : null;
}

/**
 * The placement of a task's top-level ancestor (its ownership root),
 * as the encoded cell value. Sub-tasks resolve through
 * their ancestry; a broken chain resolves to the Inbox (null).
 */
function topLevelPlacementKey(store: MergeableStore, id: string): string | null {
  let cur = id;
  const guard = new Set<string>();
  for (;;) {
    if (guard.has(cur)) return null;
    guard.add(cur);
    const p = getPlacement(store, cur);
    if (p.kind !== 'task') return encodePlacement(p);
    if (!store.hasRow(TABLES.tasks, p.id)) return null;
    cur = p.id;
  }
}

function SectionRow({
  sectionId,
  handle,
}: {
  sectionId: string;
  handle?: SortableHandleProps;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const section = useSection(store, sectionId);
  const { offerUndo } = useUndo();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Freshly created sections land with an empty name and a queued
  // focus handoff — the title input grabs focus on first mount.
  const [autoFocus] = useState(() => consumeSectionTitleFocus(sectionId));
  if (!section) return null;

  const classes = ['section-row'];
  if (handle) classes.push('sortable-row');
  if (handle?.isDragging) classes.push('sortable-row-active');
  if (handle?.isOver) classes.push('sortable-row-over');

  return (
    <div
      ref={handle?.ref}
      style={handle?.style}
      className={classes.join(' ')}
      data-drag-over={handle?.isOver ? 'true' : undefined}
    >
      {handle && (
        <button
          type="button"
          {...(handle.attributes ?? {})}
          className="task-line-drag-handle"
          aria-label="Drag to reorder section"
          title="Drag to reorder section"
          onClick={(e) => e.preventDefault()}
          {...(handle.listeners ?? {})}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#section-drag-icon" />
          </svg>
        </button>
      )}
      <EditableTitle
        value={section.name}
        placeholder="Untitled section"
        autoFocus={autoFocus}
        onCommit={(next) => updateSection(store, sectionId, { name: next })}
      />
      <button
        type="button"
        className="task-line-action"
        aria-label="Add task to section"
        title="Add task to section"
        onClick={() => {
          const childId = createTask(store, {
            title: '',
            placement: { kind: 'section', id: sectionId },
          });
          queueTaskTitleFocus(childId);
        }}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#plus-filled-icon" />
        </svg>
      </button>
      <button
        type="button"
        className="task-line-action task-line-action-danger"
        aria-label="Delete section"
        title="Delete"
        onClick={() => setConfirmDelete(true)}
      >
        <svg className="svg-icon" aria-hidden="true">
          <use href="/icons.svg#trash-icon" />
        </svg>
      </button>
      <ConfirmModal
        open={confirmDelete}
        title="Delete section?"
        message={`"${section.name || 'Untitled section'}" and its tasks will be deleted.`}
        confirmLabel="Delete"
        onConfirm={() => {
          const snapshot = captureSubtree(store, TOMBSTONE_ENTITY_TYPE.section, sectionId);
          deleteSection(store, sectionId);
          setConfirmDelete(false);
          offerUndo({
            label: `Deleted section “${section.name || 'Untitled section'}”`,
            onUndo: () => restoreSubtree(store, snapshot),
          });
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

export function SectionedTaskTree({
  projectId,
  ids,
  showCompleted = false,
  hideEmptySections = false,
  ariaLabel,
  taskProgress,
}: {
  projectId: string;
  /** Deep list of visible task ids (top-level + descendants). */
  ids: readonly string[];
  /** Show done tasks in place instead of pruning their subtrees. */
  showCompleted?: boolean;
  /** Skip section headers with no visible tasks under them. */
  hideEmptySections?: boolean;
  ariaLabel?: string;
  /** Per-ancestor subtask progress rendered as a meter on each row. */
  taskProgress?: ReadonlyMap<string, { done: number; total: number }>;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const sectionIds = useSectionIdsForProject(store, projectId);

  const projectKey = `project${PLACEMENT_SEP}${projectId}`;
  const nodes: SortableTreeNode<string>[] = [];
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const key = topLevelPlacementKey(store, id) ?? projectKey;
    const list = groups.get(key);
    if (list) list.push(id);
    else groups.set(key, [id]);
  }
  const buildGroup = (key: string): TaskTreeNode[] => {
    const tree = buildTaskTree(store, groups.get(key) ?? []);
    return showCompleted ? tree.children : pruneDoneTasks(store, tree.children);
  };
  nodes.push(...buildGroup(projectKey));
  for (const sid of sectionIds) {
    const children = buildGroup(sectionNodeId(sid));
    if (hideEmptySections && children.length === 0) continue;
    nodes.push({ id: sectionNodeId(sid), children });
  }

  if (nodes.length === 0) return null;

  function onMove(
    activeId: string,
    parentId: string | null,
    beforeId: string | undefined,
  ): void {
    const activeSection = decodeSectionNodeId(activeId);
    if (activeSection !== null) {
      const beforeSection = beforeId ? decodeSectionNodeId(beforeId) : null;
      if (beforeId !== undefined && beforeSection === null) {
        // Dropped into the unsectioned block at the top — become the
        // first section instead (sections always follow unsectioned tasks).
        moveSection(store, activeSection, sectionIds.find((s) => s !== activeSection));
      } else {
        moveSection(store, activeSection, beforeSection ?? undefined);
      }
      return;
    }
    const placement = parentId ?? projectKey;
    // A drop right before a section header lands at the end of the
    // preceding task group — sections are never task siblings.
    const beforeTask =
      beforeId !== undefined && decodeSectionNodeId(beforeId) === null
        ? beforeId
        : undefined;
    moveTask(store, activeId, placement, beforeTask);
  }

  return (
    <SortableTree
      nodes={nodes}
      onMove={onMove}
      ariaLabel={ariaLabel ?? 'Tasks'}
      className="sortable-list project-task-tree"
      indentWidth={22}
      maxDepthOf={(id) =>
        decodeSectionNodeId(id) !== null ? 0 : Number.POSITIVE_INFINITY
      }
    >
      {(id, handle) => {
        const sid = decodeSectionNodeId(id);
        if (sid !== null) {
          return (
            <SectionRow
              sectionId={sid}
              handle={handle}
            />
          );
        }
        return <TaskRow handle={handle} taskId={id} progress={taskProgress?.get(id)} />;
      }}
    </SortableTree>
  );
}
