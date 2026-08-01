import { useDataLayer, useProject } from '../../data/index.ts';
import { useSelection } from '../context/useSelection.ts';
import type { SortableHandleProps } from '../dnd/SortableList.tsx';
import ProjectTaskList from './ProjectTaskList.tsx';
import ProjectProgressMeter from './ProjectProgressMeter.tsx';
import { ProjectAddTaskButton, ProjectAddSectionButton, ProjectRowActions } from './ProjectActions.tsx';

/**
 * One project's row in the area-view status groups. The row body is
 * shared by every group; pass a `handle` (from SortableList) to make it
 * a drag source with a grip — the Active / Backlog groups, which
 * reorder. The Done group renders it plain (no `handle`) and tints its
 * progress meter green via `doneGroup`.
 */
export default function ProjectRow({
  handle,
  projectId,
  name,
  done,
  total,
  doneGroup,
  showCompleted,
  collapsed,
  onToggleCollapse,
  hideEmptySections,
  onToggleEmptySections,
}: {
  handle?: SortableHandleProps;
  projectId: string;
  name: string;
  done: number;
  total: number;
  doneGroup?: boolean;
  showCompleted: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  hideEmptySections: boolean;
  onToggleEmptySections: () => void;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const { navigate } = useSelection();
  const project = useProject(store, projectId);

  const display = (project?.name ?? '') || name || 'Untitled';

  const openProject = (): void => {
    navigate({ kind: 'project', id: projectId });
  };

  const sortable = handle !== undefined;
  const classes = ['project-row'];
  if (doneGroup) classes.push('project-row-done');
  if (sortable) {
    classes.push('sortable-row');
    if (handle.isDragging) classes.push('sortable-row-active');
    if (handle.isOver) classes.push('sortable-row-over');
  }

  // Long-press touch drag activates from anywhere on the row (grips are
  // hidden on coarse pointers); mouse + keyboard stay on the grip.
  // Stripping onTouchStart from the grip keeps a touch landing on it
  // from registering a second activation via event bubbling.
  const { onTouchStart, ...gripListeners } = (handle?.listeners ?? {}) as {
    onTouchStart?: React.TouchEventHandler;
  } & Record<string, unknown>;

  return (
    <li
      ref={sortable ? handle.ref : undefined}
      style={sortable ? handle.style : undefined}
      className={classes.join(' ')}
      data-drag-over={sortable && handle.isOver ? 'true' : undefined}
      {...(sortable && onTouchStart ? { onTouchStart } : {})}
    >
      <div className="project-row-line" onClick={openProject}>
        {sortable && (
          <button
            type="button"
            className="project-row-drag-handle icon-button"
            aria-label="Drag to reorder"
            title="Drag to reorder"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            {...(handle.attributes ?? {})}
            {...gripListeners}
          >
            <svg className="svg-icon" aria-hidden="true">
              <use href="/icons.svg#drag-icon" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="project-row-caret icon-button"
          aria-label={collapsed ? `Expand ${display}` : `Collapse ${display}`}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand tasks' : 'Collapse tasks'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse();
          }}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href={`/icons.svg#${collapsed ? 'chevron-right-icon' : 'chevron-down-icon'}`} />
          </svg>
        </button>
        <button
          type="button"
          className="project-row-name"
          title="Open project"
          onClick={(e) => {
            e.stopPropagation();
            openProject();
          }}
        >
          {display}
        </button>
        <ProjectAddTaskButton
          projectId={projectId}
          display={display}
          onEnsureExpanded={() => {
            if (collapsed) onToggleCollapse();
          }}
        />
        <ProjectAddSectionButton
          projectId={projectId}
          display={display}
          hideEmptySections={hideEmptySections}
          onToggleEmptySections={onToggleEmptySections}
          onEnsureExpanded={() => {
            if (collapsed) onToggleCollapse();
          }}
        />
        <div className="project-row-actions">
          <ProjectRowActions
            projectId={projectId}
            display={display}
            hideEmptySections={hideEmptySections}
            onToggleEmptySections={onToggleEmptySections}
          />
        </div>
        <ProjectProgressMeter done={done} total={total} doneGroup={doneGroup} />
      </div>
      {!collapsed && (
        <div className="project-row-tasks">
          <ProjectTaskList
            projectId={projectId}
            projectName={display}
            showCompleted={showCompleted}
            hideEmptySections={hideEmptySections}
          />
        </div>
      )}
    </li>
  );
}
