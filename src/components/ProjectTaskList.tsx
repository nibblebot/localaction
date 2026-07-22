/**
 * Project task list — the single implementation behind every expanded
 * project card in the area view's combined Projects tab: a sectioned
 * SortableTree with fully editable sections, new-task and new-section
 * inputs, and the person-filter "N tasks hidden" stub.
 */
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
        <InlineAddInput
          placeholder="New section…"
          ariaLabel="New section"
          onSubmit={addSection}
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
