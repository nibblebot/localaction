import { useRef } from 'react';
import {
  useDataLayer,
  useInboxTaskIds,
  createTask,
  moveTask,
  PLACEMENT_SEP,
} from '../../data/index.ts';
import { TaskTreeByStatus } from '../tasks/TaskList.tsx';
import InlineAddInput from '../shared/InlineAddInput.tsx';
import CompletedToggle from '../area/CompletedToggle.tsx';
import { useShowCompleted } from '../hooks/useShowCompleted.ts';
import { useDeepTaskIds } from '../tasks/taskTree.ts';
import { useFocusEmptyList } from '../hooks/useFocusEmptyList.ts';

export default function InboxPane(): React.JSX.Element {
  const { store } = useDataLayer();
  const topLevelIds = useInboxTaskIds(store);
  // TaskTreeByStatus builds the tree itself — feed it the flat deep
  // list (top-level + descendants), same as the project/area tabs.
  const allIds = useDeepTaskIds(store, topLevelIds);
  const { showCompleted, toggle: toggleCompleted } = useShowCompleted();
  function addTask(title: string): void {
    createTask(store, { title });
  }
  function onMove(
    activeId: string,
    parentId: string | null,
    beforeId: string | undefined,
  ): void {
    moveTask(
      store,
      activeId,
      parentId ? `task${PLACEMENT_SEP}${parentId}` : null,
      beforeId,
    );
  }
  const addInputRef = useRef<HTMLInputElement>(null);
  useFocusEmptyList(addInputRef, allIds.length === 0);
  return (
    <main className="main" aria-label="Inbox">
      <div className="main-body">
        <header className="main-pane-header">
          <h2 className="main-pane-title">Inbox</h2>
          <CompletedToggle showCompleted={showCompleted} onToggle={toggleCompleted} />
        </header>
        <section className="tasks-tab" aria-label="Inbox tasks">
          <TaskTreeByStatus
            ids={allIds}
            onMove={onMove}
            ariaLabel="Inbox tasks"
            showCompleted={showCompleted}
          />
          <InlineAddInput
            ref={addInputRef}
            placeholder={
              allIds.length === 0
                ? 'No inbox tasks yet — add the first one.'
                : 'New inbox task…'
            }
            ariaLabel="New inbox task"
            onSubmit={addTask}
          />
        </section>
      </div>
    </main>
  );
}
