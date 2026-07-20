/**
 * Project task tree with Sections — one flattened SortableTree spans the
 * unsectioned group plus every section block, so a single drag can
 * reorder tasks, nest sub-tasks, move tasks between groups, and reorder
 * the sections themselves.
 *
 * Model: the tree's root level holds the project's unsectioned top-level
 * tasks first, then one node per section whose children are the
 * section's top-level tasks. Section node ids are the ADR-0001 placement
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
 * `readOnlySections` (area rollup views): section headers render as
 * plain text with no drag handle, rename, or delete. Empty sections
 * still show, matching the project view. Tasks stay fully draggable
 * between groups.
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
  moveSection,
  moveTask,
  buildTaskTree,
  pruneDoneTasks,
  getPlacement,
  encodePlacement,
  PLACEMENT_SEP,
  TABLES,
} from '../data/index.ts';
import type { TaskTreeNode } from '../data/index.ts';
import { SortableTree } from './SortableTree.tsx';
import type { SortableTreeNode } from './SortableTree.tsx';
import type { SortableHandleProps } from './SortableList.tsx';
import { TaskRow } from './TaskList.tsx';
import { queueTaskTitleFocus } from './taskTitleFocus.ts';
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
 * The placement of a task's top-level ancestor (its ownership root,
 * ADR-0001), as the encoded cell value. Sub-tasks resolve through
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
  readOnly,
  autoFocusName,
}: {
  sectionId: string;
  handle?: SortableHandleProps;
  readOnly?: boolean;
  autoFocusName?: boolean;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const section = useSection(store, sectionId);
  const [confirmDelete, setConfirmDelete] = useState(false);
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
          className="task-line-drag-handle"
          aria-label="Drag to reorder section"
          title="Drag to reorder section"
          onClick={(e) => e.preventDefault()}
          {...(handle.listeners ?? {})}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#drag-icon" />
          </svg>
        </button>
      )}
      {readOnly ? (
        <span className="section-row-name">{section.name || 'Untitled section'}</span>
      ) : (
        <>
          <EditableTitle
            value={section.name}
            placeholder="Untitled section"
            autoFocusOnCreate={autoFocusName}
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
              deleteSection(store, sectionId);
              setConfirmDelete(false);
            }}
            onCancel={() => setConfirmDelete(false)}
          />
        </>
      )}
    </div>
  );
}

export function SectionedTaskTree({
  projectId,
  ids,
  showCompleted = false,
  readOnlySections = false,
  focusSectionId,
  ariaLabel,
}: {
  projectId: string;
  /** Deep list of visible task ids (top-level + descendants). */
  ids: readonly string[];
  /** Show done tasks in place instead of pruning their subtrees. */
  showCompleted?: boolean;
  /** Area rollups: plain section headers, no section editing. */
  readOnlySections?: boolean;
  /** Section whose name input should grab focus (just created). */
  focusSectionId?: string | null;
  ariaLabel?: string;
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
  // Every section renders — empty ones included — so rollups match the
  // project view. In the project view they stay editable; rollups show
  // them as plain read-only headers.
  for (const sid of sectionIds) {
    nodes.push({ id: sectionNodeId(sid), children: buildGroup(sectionNodeId(sid)) });
  }

  if (nodes.length === 0) return null;

  function onMove(
    activeId: string,
    parentId: string | null,
    beforeId: string | undefined,
  ): void {
    const activeSection = decodeSectionNodeId(activeId);
    if (activeSection !== null) {
      if (readOnlySections) return;
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
      className="sortable-list"
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
              handle={readOnlySections ? undefined : handle}
              readOnly={readOnlySections}
              autoFocusName={focusSectionId === sid}
            />
          );
        }
        return <TaskRow handle={handle} taskId={id} />;
      }}
    </SortableTree>
  );
}
