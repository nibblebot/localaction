import { useMemo, useRef } from 'react';
import {
  useDataLayer,
  useInboxTaskIds,
  createTask,
  getRootTriState,
} from '../../data/index.ts';
import RootGroups from '../tasks/RootGroups.tsx';
import type { RootGroupSlice } from '../tasks/RootGroups.tsx';
import InlineAddInput from '../shared/InlineAddInput.tsx';
import { useFocusEmptyList } from '../hooks/useFocusEmptyList.ts';

/**
 * The inbox: the same Active / Backlog / Done root-task groups as the
 * area view, with no sub-area slices (a single headerless slice).
 * The add-task input creates Active inbox roots (placement absent).
 */
export default function InboxPane(): React.JSX.Element {
  const { store } = useDataLayer();
  const topLevelIds = useInboxTaskIds(store);

  const slices = useMemo<readonly RootGroupSlice[]>(() => {
    const active: string[] = [];
    const backlog: string[] = [];
    const done: string[] = [];
    for (const tid of topLevelIds) {
      const tri = getRootTriState(store, tid);
      if (tri === 'done') done.push(tid);
      else if (tri === 'backlog') backlog.push(tid);
      else active.push(tid);
    }
    return [
      { key: 'inbox', placement: null, active, backlog, done },
    ];
  }, [store, topLevelIds]);

  function addTask(title: string): void {
    createTask(store, { title });
  }

  const addInputRef = useRef<HTMLInputElement>(null);
  useFocusEmptyList(addInputRef, topLevelIds.length === 0);

  return (
    <main className="main" aria-label="Inbox">
      <div className="main-body">
        <header className="main-pane-header">
          <h2 className="main-pane-title">Inbox</h2>
        </header>
        <section className="tasks-tab" aria-label="Inbox tasks">
          <RootGroups
            slices={slices}
            renderGroupFooter={(group) =>
              group === 'active' ? (
                <InlineAddInput
                  ref={addInputRef}
                  placeholder={
                    topLevelIds.length === 0
                      ? 'No inbox tasks yet — add the first one.'
                      : 'New inbox task…'
                  }
                  ariaLabel="New inbox task"
                  onSubmit={addTask}
                />
              ) : null
            }
          />
        </section>
      </div>
    </main>
  );
}