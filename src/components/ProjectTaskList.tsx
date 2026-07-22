/**
 * Project task list — the single implementation behind every expanded
 * project card in the area view's combined Projects tab: a sectioned
 * SortableTree with fully editable sections, a new-task input, an
 * add-section action, and the person-filter "N tasks hidden" stub.
 */
import { useState } from 'react';
import { useDataLayer, createTask, createSection } from '../data/index.ts';
import { useProjectTaskList } from './useProjectTaskList.ts';
import { SectionedTaskTree } from './SectionedTaskTree.tsx';
import InlineAddInput from './InlineAddInput.tsx';

export default function ProjectTaskList({
  projectId,
  projectName,
  showCompleted,
}: {
  projectId: string;
  projectName: string;
  /** Show done tasks in place instead of pruning their subtrees. */
  showCompleted: boolean;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { taskIds, visibleIds, hiddenCount, subtaskProgress } = useProjectTaskList(projectId);

  // Id of a just-created section whose name input should autofocus.
  const [focusSectionId, setFocusSectionId] = useState<string | null>(null);

  function addTask(title: string): void {
    createTask(store, { title, placement: { kind: 'project', id: projectId } });
  }

  function addSection(): void {
    const sid = createSection(store, { name: '', projectId });
    setFocusSectionId(sid);
  }

  return (
    <>
      <SectionedTaskTree
        projectId={projectId}
        ids={visibleIds}
        showCompleted={showCompleted}
        focusSectionId={focusSectionId}
        ariaLabel={`Tasks for ${projectName}`}
        taskProgress={subtaskProgress}
      />
      <div className="tasks-tab-footer">
        <InlineAddInput
          placeholder={
            taskIds.length === 0
              ? 'No tasks yet — add the first one.'
              : 'New task…'
          }
          ariaLabel="New task"
          onSubmit={addTask}
        />
        <button
          type="button"
          className="tasks-tab-add-section"
          aria-label="Add section"
          title="Add section"
          onClick={addSection}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#add-icon" />
          </svg>
        </button>
      </div>
      {hiddenCount > 0 && (
        <p className="hidden-stub">
          {hiddenCount} {hiddenCount === 1 ? 'task' : 'tasks'} hidden
        </p>
      )}
    </>
  );
}
