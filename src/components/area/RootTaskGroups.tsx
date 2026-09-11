import { useMemo, useState } from 'react';
import {
  useDataLayer,
  useTableVersion,
  getAreaTaskIds,
  getRootTriState,
  createTask,
  setRootBacklog,
  TABLES,
} from '../../data/index.ts';
import { areaColorHex } from '../../data/colors.ts';
import type { AreaColorId } from '../../data/colors.ts';
import { useSelection } from '../context/useSelection.ts';
import RootGroups from '../tasks/RootGroups.tsx';
import type { RootGroupSlice } from '../tasks/RootGroups.tsx';
import InlineAddField from '../shared/InlineAddField.tsx';
import type { SubAreaRef } from './types.ts';

/**
 * The viewed area's root tasks PLUS each sub-area's roots, hoisted into
 * the shared Active / Backlog / Done groups and split into per-area slices
 * (slice header = area name). Partitioning is by `getRootTriState`: a
 * stored backlog cell shelves a root (and its subtree) into Backlog; a
 * fully-done subtree lands in Done (done wins over backlog); everything
 * else is Active. The viewed area's own slice renders headerless first;
 * sub-areas follow depth-first with a clickable name header.
 */
export default function RootTaskGroups({
  areaId,
  subAreas,
  showCompleted = true,
}: {
  areaId: string;
  subAreas: readonly SubAreaRef[];
  /** False hides the Done group and every completed row. */
  showCompleted?: boolean;
}): React.JSX.Element {
  const { store } = useDataLayer();
  // Top-level ids for every slice are read imperatively (one hook per
  // sub-area can't loop), so the tasks table version is the memo
  // invalidation token covering all partitions.
  const tasksV = useTableVersion(store, TABLES.tasks);

  const slices = useMemo<readonly RootGroupSlice[]>(() => {
    void tasksV; // invalidation token
    const partition = (id: string): Pick<RootGroupSlice, 'active' | 'backlog' | 'done'> => {
      const active: string[] = [];
      const backlog: string[] = [];
      const done: string[] = [];
      for (const tid of getAreaTaskIds(store, id, tasksV)) {
        const tri = getRootTriState(store, tid);
        if (tri === 'done') done.push(tid);
        else if (tri === 'backlog') backlog.push(tid);
        else active.push(tid);
      }
      return { active, backlog, done };
    };
    const viewed = partition(areaId);
    return [
      // The viewed area's own roots always render headerless at the top
      // of each group — no "This area" grouping.
      {
        key: areaId,
        placement: `area:${areaId}`,
        ...viewed,
      },
      ...subAreas.map((sa) => ({
        key: sa.id,
        placement: `area:${sa.id}`,
        ...partition(sa.id),
        header: <SubAreaHeader areaId={sa.id} name={sa.name} color={sa.color} />,
      })),
    ];
  }, [store, tasksV, areaId, subAreas]);

  // A "+" on each of the Active / Backlog headers reveals an add input:
  // Active creates an area root (placement area:<id>); Backlog creates
  // one and shelves it (single transaction). Matches the inbox behavior.
  // Shift+Enter in either input commits and keeps it open (quick entry).
  const [adding, setAdding] = useState<'active' | 'backlog' | null>(null);

  function addTask(title: string): void {
    createTask(store, { title, placement: { kind: 'area', id: areaId } });
  }

  function addBacklogTask(title: string): void {
    // One transaction: the new root arrives shelved in a single write.
    store.transaction(() => {
      setRootBacklog(
        store,
        createTask(store, { title, placement: { kind: 'area', id: areaId } }),
        true,
      );
    });
  }

  return (
    <section className="tasks-tab" aria-label="Tasks">
      <RootGroups
        slices={slices}
        showCompleted={showCompleted}
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
                placeholder="New task…"
                ariaLabel="New task"
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
  );
}

/** Clickable heading for a rolled-in sub-area slice. */
export function SubAreaHeader({
  areaId,
  name,
  color,
}: {
  areaId: string;
  name: string;
  color: AreaColorId;
}): React.JSX.Element {
  const { navigate } = useSelection();
  return (
    <header className="subarea-header">
      <button
        type="button"
        className="subarea-header-name"
        title="Open sub-area"
        onClick={() => navigate({ kind: 'area', id: areaId })}
      >
        <span
          className="sidebar-item-dot"
          style={{ background: areaColorHex(color) }}
          aria-hidden="true"
        />
        {name || 'Untitled'}
      </button>
    </header>
  );
}