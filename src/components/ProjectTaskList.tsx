/**
 * Project task list — the single implementation behind both the
 * project view's Tasks tab and every per-project group in the area
 * view's Tasks rollup. Same functionality in both: a sectioned
 * SortableTree with fully editable sections, a new-task input, an
 * add-section action, and the person-filter "N tasks hidden" stub.
 *
 * `showHeader` (area rollup) prepends a project-name header with a
 * visible-task count; the header links to the project's own Tasks
 * view. The project view omits it because the pane header already
 * names the project.
 */
import { useEffect, useRef, useState } from 'react';
import { useDataLayer, createTask, createSection } from '../data/index.ts';
import { formatRoute } from '../router.ts';
import { useProjectTaskList } from './useProjectTaskList.ts';
import { SectionedTaskTree } from './SectionedTaskTree.tsx';
import InlineAddInput from './InlineAddInput.tsx';

export default function ProjectTaskList({
  projectId,
  projectName,
  showCompleted,
  showHeader = false,
  autoFocusAddInput = false,
}: {
  projectId: string;
  projectName: string;
  /** Show done tasks in place instead of pruning their subtrees. */
  showCompleted: boolean;
  /** Area rollups: prepend a project header with a task count. */
  showHeader?: boolean;
  /** Focus the new-task input when the list is (or just was) empty. */
  autoFocusAddInput?: boolean;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { taskIds, visibleIds, hiddenCount } = useProjectTaskList(projectId);

  // Id of a just-created section whose name input should autofocus.
  const [focusSectionId, setFocusSectionId] = useState<string | null>(null);

  function addTask(title: string): void {
    createTask(store, { title, placement: { kind: 'project', id: projectId } });
  }

  function addSection(): void {
    const sid = createSection(store, { name: '', projectId });
    setFocusSectionId(sid);
  }

  const addInputRef = useRef<HTMLInputElement>(null);
  const wasEmpty = useRef(taskIds.length === 0);
  useEffect(() => {
    if (!autoFocusAddInput) return;
    const empty = taskIds.length === 0;
    // Focus for quick entry when the list is (or just was) empty — but
    // never steal focus from a row that just grabbed it (a section's
    // add-task action focuses its new title input in the same commit).
    if (
      (empty || wasEmpty.current) &&
      (document.activeElement === null || document.activeElement === document.body)
    ) {
      addInputRef.current?.focus();
    }
    wasEmpty.current = empty;
  }, [autoFocusAddInput, taskIds.length]);

  return (
    <>
      {showHeader && (
        <a
          className="project-header"
          href={formatRoute({ kind: 'project', id: projectId })}
          title={`Open ${projectName || 'Untitled'}`}
        >
          <span className="project-header-name">{projectName || 'Untitled'}</span>
          <span className="project-header-count">· {visibleIds.length}</span>
        </a>
      )}
      <SectionedTaskTree
        projectId={projectId}
        ids={visibleIds}
        showCompleted={showCompleted}
        focusSectionId={focusSectionId}
        ariaLabel={`Tasks for ${projectName}`}
      />
      <div className="tasks-tab-footer">
        <InlineAddInput
          ref={addInputRef}
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
