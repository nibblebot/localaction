import { useMemo } from 'react';
import {
  useDataLayer,
  useArea,
  useProjectRollups,
  createProject,
  updateProject,
  PROJECT_STATUS,
} from '../../data/index.ts';
import { areaColorHex } from '../../data/colors.ts';
import type { AreaColorId } from '../../data/colors.ts';
import { useSelection } from '../context/useSelection.ts';
import ProjectStatusGroups from '../projects/ProjectStatusGroups.tsx';
import type { ProjectStatusSlice } from '../projects/ProjectStatusGroups.tsx';
import ProjectRow from '../projects/ProjectRow.tsx';
import InlineAddButton from '../shared/InlineAddButton.tsx';
import type { SubAreaRef } from './types.ts';

export default function ProjectsSection({
  areaId,
  subAreas,
  showCompleted,
  collapsed,
  onToggleCollapse,
  collapsedGroups,
  onToggleGroup,
  showEmptySections,
  onToggleEmptySections,
}: {
  areaId: string;
  subAreas: readonly SubAreaRef[];
  showCompleted: boolean;
  collapsed: ReadonlySet<string>;
  onToggleCollapse: (id: string) => void;
  collapsedGroups: ReadonlySet<string>;
  onToggleGroup: (id: string) => void;
  /** Project ids whose empty section headers are kept visible. */
  showEmptySections: ReadonlySet<string>;
  onToggleEmptySections: (id: string) => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const rollups = useProjectRollups(store);

  // One slice per in-scope area — the viewed area first (headerless),
  // then every sub-area depth-first — each partitioning its visible
  // projects into the hoisted Active / Backlog / Done groups. Backlog
  // is a stored status and wins over the derived done state: a shelved
  // project stays shelved even when its tasks complete.
  const slices = useMemo<readonly ProjectStatusSlice[]>(() => {
    const partition = (id: string, name: string | null): ProjectStatusSlice => {
      const sorted = rollups
        .filter((r) => r.areaId === id)
        .sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          return a.projectName.localeCompare(b.projectName);
        });
      return {
        areaId: id,
        name,
        backlog: sorted.filter((p) => p.status === PROJECT_STATUS.backlog),
        done: sorted.filter(
          (p) => p.status !== PROJECT_STATUS.backlog && p.total > 0 && p.done === p.total,
        ),
        active: sorted.filter(
          (p) => p.status !== PROJECT_STATUS.backlog && (p.total === 0 || p.done < p.total),
        ),
      };
    };
    return [
      partition(areaId, null),
      ...subAreas.map((sa) => partition(sa.id, sa.name)),
    ];
  }, [rollups, areaId, subAreas]);

  // Sub-area chrome (a clickable header) is attached to the slices here
  // so ProjectStatusGroups stays presentational. The viewed area's own
  // slice gets a static "Area projects" header once sub-areas roll in —
  // with no sub-areas there is nothing to disambiguate, so it stays
  // headerless.
  const viewedArea = useArea(store, areaId);
  const slicesWithChrome = useMemo<readonly ProjectStatusSlice[]>(
    () =>
      slices.map((s) =>
        s.name === null
          ? subAreas.length === 0 || !viewedArea
            ? s
            : { ...s, header: <AreaProjectsHeader color={viewedArea.color} /> }
          : {
            ...s,
            header: (
              <SubAreaHeader
                areaId={s.areaId}
                name={s.name}
                color={subAreas.find((sa) => sa.id === s.areaId)?.color ?? 'gray'}
              />
            ),
          },
      ),
    [slices, subAreas, viewedArea],
  );

  function addProject(name: string, group: 'active' | 'backlog'): void {
    const id = createProject(store, { name, areaId });
    if (group === 'backlog') updateProject(store, id, { status: PROJECT_STATUS.backlog });
  }

  return (
    <section className="projects-tab" aria-label="Projects">
      <ProjectStatusGroups
        slices={slicesWithChrome}
        collapsedGroups={collapsedGroups}
        onToggleGroup={onToggleGroup}
        renderGroupAction={(group) => (
          <InlineAddButton
            label={group === 'active' ? 'Add project to Active' : 'Add project to Backlog'}
            placeholder="New project…"
            inputAriaLabel="New project"
            className="area-tab-action-add"
            onSubmit={(name) => addProject(name, group)}
            onOpenChange={(open) => {
              if (open && collapsedGroups.has(group)) onToggleGroup(group);
            }}
          />
        )}
        renderSortableRow={(p, handle) => (
          <ProjectRow
            key={p.projectId}
            handle={handle}
            projectId={p.projectId}
            name={p.projectName}
            done={p.done}
            total={p.total}
            showCompleted={showCompleted}
            collapsed={collapsed.has(p.projectId)}
            onToggleCollapse={() => onToggleCollapse(p.projectId)}
            hideEmptySections={!showEmptySections.has(p.projectId)}
            onToggleEmptySections={() => onToggleEmptySections(p.projectId)}
          />
        )}
        renderRow={(p) => (
          <ProjectRow
            key={p.projectId}
            projectId={p.projectId}
            name={p.projectName}
            done={p.done}
            total={p.total}
            doneGroup
            showCompleted={showCompleted}
            collapsed={collapsed.has(p.projectId)}
            onToggleCollapse={() => onToggleCollapse(p.projectId)}
            hideEmptySections={!showEmptySections.has(p.projectId)}
            onToggleEmptySections={() => onToggleEmptySections(p.projectId)}
          />
        )}
      />
    </section>
  );
}

/** Static heading for the viewed area's own project slice: the
 *  projects that live directly in the area rather than in one of its
 *  sub-areas. A label, not a navigation target — clicking through
 *  would be a no-op on the already-viewed area. */
export function AreaProjectsHeader({
  color,
}: {
  color: AreaColorId;
}): React.JSX.Element {
  return (
    <header className="subarea-header">
      <span className="subarea-header-name subarea-header-static">
        <span
          className="sidebar-item-dot"
          style={{ background: areaColorHex(color) }}
          aria-hidden="true"
        />
        Area projects
      </span>
    </header>
  );
}

/** Clickable heading for a rolled-in sub-area section. */
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