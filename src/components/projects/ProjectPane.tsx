import { useDataLayer, useProject } from '../../data/index.ts';
import { useShowCompleted } from '../hooks/useShowCompleted.ts';
import { useShowEmptySections } from '../hooks/useShowEmptySections.ts';
import EmptyState from '../shared/EmptyState.tsx';
import ProjectPaneHeader from './ProjectPaneHeader.tsx';
import CompletedToggle from '../area/CompletedToggle.tsx';
import { ProjectAddTaskButton, ProjectAddSectionButton } from './ProjectActions.tsx';
import ProjectTaskList from './ProjectTaskList.tsx';

/**
 * Project detail pane — the standalone form of an expanded project card
 * in the area view (`#/p/<id>`, reached by clicking a project row). The
 * header carries the area breadcrumb, the progress meter, the due
 * date, and the management cluster that only exists here (notes,
 * rename, delete); the task-list head row carries add-task/add-section
 * on the left with the shared Completed toggle and the empty-sections
 * toggle floated right. The body is the same sectioned
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
  const { showCompleted, toggle: toggleCompleted } = useShowCompleted();
  const showEmptySections = useShowEmptySections();
  const hideEmptySections = !showEmptySections.collapsed.has(projectId);

  if (!project) return <EmptyState message="This project no longer exists." />;

  const projectName = project.name || 'Untitled';

  return (
    <main className="main" aria-label="Editor">
      <div className="main-body">
        <ProjectPaneHeader
          areaId={project.areaId}
          projectId={projectId}
          name={projectName}
          management
        />
        <section className="pane-section pane-section-static" aria-label="Tasks">
          <div className="pane-section-head">
            <div className="pane-section-head-actions">
              <ProjectAddTaskButton projectId={projectId} display={projectName} />
              <ProjectAddSectionButton
                projectId={projectId}
                display={projectName}
                hideEmptySections={hideEmptySections}
                onToggleEmptySections={() => showEmptySections.toggle(projectId)}
              />
            </div>
            <div className="pane-section-head-toggles">
              <CompletedToggle showCompleted={showCompleted} onToggle={toggleCompleted} />
              <button
                type="button"
                className={`area-tab-action icon-button${hideEmptySections ? '' : ' area-tab-action-active'}`}
                aria-label={`${hideEmptySections ? 'Show' : 'Hide'} empty sections in ${projectName}`}
                aria-pressed={!hideEmptySections}
                title={hideEmptySections ? 'Show empty sections' : 'Hide empty sections'}
                onClick={() => showEmptySections.toggle(projectId)}
              >
                <svg className="svg-icon" aria-hidden="true">
                  <use href="/icons.svg#sections-icon" />
                </svg>
              </button>
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
