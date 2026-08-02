import { useMemo } from 'react';
import {
  useDataLayer,
  useAreaTaskIds,
  getAreaTaskIds,
  createTask,
  moveTask,
  PLACEMENT_SEP,
  getEffectiveTaskStatus,
  TASK_STATUS,
  TABLES,
} from '../../data/index.ts';
import { useTableVersion } from '../../data/index.ts';
import CollapsibleSection from './CollapsibleSection.tsx';
import { TaskTreeByStatus } from '../tasks/TaskList.tsx';
import Group from '../tasks/Group.tsx';
import { queueTaskTitleFocus } from '../hooks/taskTitleFocus.ts';
import { useDeepTaskIds, countVisibleTopLevel } from '../tasks/taskTree.ts';
import type { SubAreaRef } from './types.ts';

export default function AreaTasksSection({
  areaId,
  subAreas,
  showCompleted,
  collapsed,
  onToggleCollapse,
}: {
  areaId: string;
  subAreas: readonly SubAreaRef[];
  showCompleted: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const topLevelIds = useAreaTaskIds(store, areaId);
  // TaskTreeByStatus builds the tree itself — feed it the flat deep
  // list (top-level + descendants), same as the inbox.
  const allIds = useDeepTaskIds(store, topLevelIds);
  function onMove(
    activeId: string,
    parentId: string | null,
    beforeId: string | undefined,
  ): void {
    moveTask(
      store,
      activeId,
      parentId ? `task${PLACEMENT_SEP}${parentId}` : `area${PLACEMENT_SEP}${areaId}`,
      beforeId,
    );
  }
  const visibleTopLevel = countVisibleTopLevel(store, topLevelIds, showCompleted);
  // The section count covers the whole subtree, matching the Projects
  // and Notes section-count convention. Sub-area top-level ids are read
  // imperatively (one hook per sub-area can't loop), so the tasks table
  // version joins the memo deps as the invalidation token.
  const tasksV = useTableVersion(store, TABLES.tasks);
  const visibleSubAreaCount = useMemo(() => {
    void tasksV; // invalidation token: task edits re-run the subtree count
    let n = 0;
    for (const sa of subAreas) {
      const tops = getAreaTaskIds(store, sa.id);
      n += showCompleted
        ? tops.length
        : tops.filter((tid) => getEffectiveTaskStatus(store, tid) !== TASK_STATUS.done).length;
    }
    return n;
  }, [store, tasksV, subAreas, showCompleted]);
  return (
    <CollapsibleSection
      title="Tasks"
      count={visibleTopLevel + visibleSubAreaCount}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
      trailing={
        <button
          type="button"
          className="area-tab-action area-tab-action-add icon-button"
          aria-label="Add task"
          title="Add task"
          onClick={() => {
            if (collapsed) onToggleCollapse();
            const id = createTask(store, { title: '', placement: { kind: 'area', id: areaId } });
            queueTaskTitleFocus(id);
          }}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#add-icon" />
          </svg>
        </button>
      }
    >
      <TaskTreeByStatus
        ids={allIds}
        onMove={onMove}
        ariaLabel="Area tasks"
        showCompleted={showCompleted}
      />
      {subAreas.map((sa) => (
        <SubAreaTaskGroup
          key={sa.id}
          areaId={sa.id}
          name={sa.name}
          showCompleted={showCompleted}
        />
      ))}
    </CollapsibleSection>
  );
}

/**
 * One rolled-in sub-area's area-rooted tasks inside the viewed area's
 * Area tasks section: the same editable tree as the area's own band,
 * scoped to the sub-area's placement — a root drop inside the group
 * re-parents to that sub-area, never to the viewed area. Labeled by the
 * sub-area's name; hidden while the sub-area has no visible tasks.
 */
export function SubAreaTaskGroup({
  areaId,
  name,
  showCompleted,
}: {
  areaId: string;
  name: string;
  showCompleted: boolean;
}): React.JSX.Element | null {
  const { store } = useDataLayer();
  const topLevelIds = useAreaTaskIds(store, areaId);
  const allIds = useDeepTaskIds(store, topLevelIds);
  const visibleTopLevel = countVisibleTopLevel(store, topLevelIds, showCompleted);
  if (visibleTopLevel === 0) return null;
  function onMove(
    activeId: string,
    parentId: string | null,
    beforeId: string | undefined,
  ): void {
    moveTask(
      store,
      activeId,
      parentId ? `task${PLACEMENT_SEP}${parentId}` : `area${PLACEMENT_SEP}${areaId}`,
      beforeId,
    );
  }
  return (
    <Group title={name} count={visibleTopLevel}>
      <TaskTreeByStatus
        ids={allIds}
        onMove={onMove}
        ariaLabel={`Area tasks in ${name}`}
        showCompleted={showCompleted}
      />
    </Group>
  );
}