import { useMemo, useState } from 'react';
import {
  useDataLayer,
  useInboxTaskIds,
  createTask,
  setRootBacklog,
  getRootTriState,
} from '../../data/index.ts';
import RootGroups from '../tasks/RootGroups.tsx';
import type { RootGroupSlice } from '../tasks/RootGroups.tsx';
import InlineAddField from '../shared/InlineAddField.tsx';

/**
 * The inbox: the same Active / Backlog / Done root-task groups as the
 * area view, with no sub-area slices (a single headerless slice).
 * A "+" on each of the Active / Backlog headers reveals an add input:
 * Active creates an inbox root (placement absent); Backlog creates one
 * and shelves it. Shift+Enter in either input commits and keeps it open
 * (quick entry).
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

  const [adding, setAdding] = useState<'active' | 'backlog' | null>(null);

  function addTask(title: string): void {
    createTask(store, { title });
  }

  function addBacklogTask(title: string): void {
    // One transaction: the new root arrives shelved in a single write.
    store.transaction(() => {
      setRootBacklog(store, createTask(store, { title }), true);
    });
  }

  return (
    <main className="main" aria-label="Inbox">
      <div className="main-body">
        <header className="main-pane-header">
          <h2 className="main-pane-title">Inbox</h2>
        </header>
        <section className="tasks-tab" aria-label="Inbox tasks">
          <RootGroups
            slices={slices}
            renderGroupAction={(group) => (
              <button
                type="button"
                className="area-tab-action icon-button area-tab-action-add"
                aria-label={
                  group === 'active' ? 'Add task to Active' : 'Add task to Backlog'
                }
                title="Add task"
                onClick={() => setAdding((cur) => (cur === group ? null : group))}
              >
                <svg className="svg-icon" aria-hidden="true">
                  <use href="/icons.svg#add-icon" />
                </svg>
              </button>
            )}
            renderGroupFooter={(group) => {
              if (group === 'active') {
                return adding === 'active' ? (
                  <InlineAddField
                    placeholder="New inbox task…"
                    ariaLabel="New inbox task"
                    onSubmit={addTask}
                    continueOnShiftEnter
                    onClose={() => setAdding(null)}
                  />
                ) : null;
              }
              if (group === 'backlog') {
                return adding === 'backlog' ? (
                  <InlineAddField
                    placeholder="New backlog task…"
                    ariaLabel="New backlog task"
                    onSubmit={addBacklogTask}
                    continueOnShiftEnter
                    onClose={() => setAdding(null)}
                  />
                ) : null;
              }
              return null;
            }}
          />
        </section>
      </div>
    </main>
  );
}