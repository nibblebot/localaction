/**
 * Project task list — the single implementation behind every expanded
 * project card in the area view's combined Projects tab: a sectioned
 * SortableTree with fully editable sections, add-task and add-section
 * buttons, and the person-filter "N tasks hidden" stub.
 */
import { useState } from 'react';
import { useDataLayer, createTask, createSection } from '../data/index.ts';
import { useProjectTaskList } from './useProjectTaskList.ts';
import { SectionedTaskTree } from './SectionedTaskTree.tsx';
import InlineAddButton from './InlineAddButton.tsx';

export default function ProjectTaskList({
  projectId,
  projectName,
  showCompleted,
  hideEmptySections = false,
}: {
  projectId: string;
  projectName: string;
  /** Show done tasks in place instead of pruning their subtrees. */
  showCompleted: boolean;
  /** Skip section headers with no visible tasks under them. */
  hideEmptySections?: boolean;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { taskIds, visibleIds, hiddenCount, subtaskProgress } = useProjectTaskList(projectId);
  /** Which footer inline-add is open; the other button hides meanwhile. */
  const [openAdd, setOpenAdd] = useState<'task' | 'section' | null>(null);

  function addTask(title: string): void {
    createTask(store, { title, placement: { kind: 'project', id: projectId } });
  }

  function addSection(name: string): void {
    createSection(store, { name, projectId });
  }

  return (
    <>
      <SectionedTaskTree
        projectId={projectId}
        ids={visibleIds}
        showCompleted={showCompleted}
        hideEmptySections={hideEmptySections}
        ariaLabel={`Tasks for ${projectName}`}
        taskProgress={subtaskProgress}
      />
      <div className="tasks-tab-footer">
        <InlineAddButton
          label="Add task"
          placeholder={
            taskIds.length === 0
              ? 'No tasks yet — add the first one.'
              : 'New task…'
          }
          inputAriaLabel="New task"
          onSubmit={addTask}
          hidden={openAdd === 'section'}
          onOpenChange={(open) => setOpenAdd(open ? 'task' : null)}
        />
        <InlineAddButton
          label="Add section"
          placeholder="New section…"
          inputAriaLabel="New section"
          onSubmit={addSection}
          hidden={openAdd === 'task'}
          onOpenChange={(open) => setOpenAdd(open ? 'section' : null)}
        />
      </div>
      {hiddenCount > 0 && (
        <p className="hidden-stub">
          {hiddenCount} {hiddenCount === 1 ? 'task' : 'tasks'} hidden
        </p>
      )}
    </>
  );
}
