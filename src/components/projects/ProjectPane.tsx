import { useDataLayer, useProject, useTasksForProjectDeep } from '../../data/index.ts';
import { useShowCompleted } from '../hooks/useShowCompleted.ts';
import { useHiddenEmptySections } from '../hooks/useHiddenEmptySections.ts';
import EmptyState from '../shared/EmptyState.tsx';
import ProjectPaneHeader from './ProjectPaneHeader.tsx';
import CompletedToggle from '../area/CompletedToggle.tsx';
import { ProjectAddTaskButton, ProjectAddSectionButton } from './ProjectActions.tsx';
import ProjectTaskList from './ProjectTaskList.tsx';

/**
 * Project detail pane — the standalone form of an expanded project card
 * in the area view (`#/p/<id>`, reached by clicking a project row). The
 * header carries the area breadcrumb, the shared row actions
 * (progress, due date, empty-sections toggle), and the management
 * cluster that only exists here (notes, rename, delete) next to the
 * shared Completed toggle; the body is the same sectioned
 * `ProjectTaskList` the card expands into. Project-scoped notes stay
 * in the notes pane. The empty-sections toggle is the same device-local
 * preference the area-view card reads, so a toggle here persists and
 * reads back on the card after navigation.
 */
export default function ProjectPane({
  projectId,
}: {
  projectId: string;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const project = useProject(store, projectId);
  const taskCount = useTasksForProjectDeep(store, projectId).length;
  const { showCompleted, toggle: toggleCompleted } = useShowCompleted();
  const hiddenEmptySections = useHiddenEmptySections();
  const hideEmptySections = hiddenEmptySections.collapsed.has(projectId);

  if (!project) return <EmptyState message="This project no longer exists." />;

  const projectName = project.name || 'Untitled';

  return (
    <main className="main" aria-label="Editor">
      <div className="main-body">
        <ProjectPaneHeader
          areaId={project.areaId}
          projectId={projectId}
          name={projectName}
          actions={{
            hideEmptySections,
            onToggleEmptySections: () => hiddenEmptySections.toggle(projectId),
          }}
          trailing={
            <div className="area-header-actions">
              <CompletedToggle showCompleted={showCompleted} onToggle={toggleCompleted} />
              <button
                type="button"
                className={`area-tab-action${hideEmptySections ? ' area-tab-action-active' : ''}`}
                aria-label={`${hideEmptySections ? 'Show' : 'Hide'} empty sections in ${projectName}`}
                aria-pressed={hideEmptySections}
                title={hideEmptySections ? 'Show empty sections' : 'Hide empty sections'}
                onClick={() => hiddenEmptySections.toggle(projectId)}
              >
                <svg className="svg-icon" aria-hidden="true">
                  <use href="/icons.svg#sections-icon" />
                </svg>
              </button>
            </div>
          }
        />
        <section className="pane-section pane-section-static" aria-label="Tasks">
          <div className="pane-section-head">
            <span className="pane-section-static-label">
              <span className="pane-section-title">Tasks</span>
              <span className="tab-group-count">· {taskCount}</span>
            </span>
            <div className="pane-section-head-actions">
              <ProjectAddTaskButton projectId={projectId} display={projectName} />
              <ProjectAddSectionButton
                projectId={projectId}
                display={projectName}
                hideEmptySections={hideEmptySections}
                onToggleEmptySections={() => hiddenEmptySections.toggle(projectId)}
              />
            </div>
          </div>
          <div className="tasks-tab project-pane-tasks">
            <ProjectTaskList
              projectId={projectId}
              projectName={projectName}
              showCompleted={showCompleted}
              hideEmptySections={hideEmptySections}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
