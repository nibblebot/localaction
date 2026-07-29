/**
 * Project task list — the single implementation behind every expanded
 * project card in the area view's combined Projects tab and the
 * project detail pane: a sectioned SortableTree with fully editable
 * sections. The add-task / add-section affordances live in the
 * project-row action cluster (`ProjectRowActions`), not here.
 */
import { useProjectTaskList } from './useProjectTaskList.ts';
import { SectionedTaskTree } from './SectionedTaskTree.tsx';

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
}): React.JSX.Element | null {
  const { visibleIds, subtaskProgress } = useProjectTaskList(projectId);

  return (
    <SectionedTaskTree
      projectId={projectId}
      ids={visibleIds}
      showCompleted={showCompleted}
      hideEmptySections={hideEmptySections}
      ariaLabel={`Tasks for ${projectName}`}
      taskProgress={subtaskProgress}
    />
  );
}
