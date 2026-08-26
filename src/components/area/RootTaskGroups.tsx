import { useMemo, useState } from 'react';
import {
  useDataLayer,
  useTableVersion,
  getAreaTaskIds,
  getRootTriState,
  createTask,
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
}: {
  areaId: string;
  subAreas: readonly SubAreaRef[];
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
      {
        key: areaId,
        label: subAreas.length === 0 ? null : 'This area',
        placement: `area:${areaId}`,
        ...viewed,
        header: subAreas.length === 0 ? undefined : <AreaOwnHeader />,
      },
      ...subAreas.map((sa) => ({
        key: sa.id,
        label: sa.name,
        placement: `area:${sa.id}`,
        ...partition(sa.id),
        header: <SubAreaHeader areaId={sa.id} name={sa.name} color={sa.color} />,
      })),
    ];
  }, [store, tasksV, areaId, subAreas]);

  // The single add-task input creates Active roots in the viewed area.
  // The "+" trigger lives in the Active group header; the revealed input
  // renders appended at the end of the Active group (where the new root
  // lands). Adding always creates an Active root (placement area:<id>).
  const [adding, setAdding] = useState(false);

  function addTask(title: string): void {
    createTask(store, { title, placement: { kind: 'area', id: areaId } });
  }

  return (
    <section className="tasks-tab" aria-label="Tasks">
      <RootGroups
        slices={slices}
        renderGroupAction={(group) =>
          group === 'active' ? (
            <button
              type="button"
              className="area-tab-action icon-button area-tab-action-add"
              aria-label="Add task to Active"
              title="Add task"
              onClick={() => setAdding((open) => !open)}
            >
              <svg className="svg-icon" aria-hidden="true">
                <use href="/icons.svg#add-icon" />
              </svg>
            </button>
          ) : null
        }
        renderGroupFooter={(group) =>
          group === 'active' && adding ? (
            <InlineAddField
              placeholder="New task…"
              ariaLabel="New task"
              onSubmit={addTask}
              onClose={() => setAdding(false)}
            />
          ) : null
        }
      />
    </section>
  );
}

/** Static header for the viewed area's own slice: the roots that live
 * directly in the area rather than in one of its sub-areas. A label, not
 * a navigation target. */
function AreaOwnHeader(): React.JSX.Element {
  return (
    <header className="subarea-header">
      <span className="subarea-header-name subarea-header-static">This area</span>
    </header>
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