import { useDataLayer, updateProject, useProject } from '../../data/index.ts';
import DueDateButton from '../due/DueDateButton.tsx';

/** Due-date control for a project row (see `DueDateButton`). */
export default function ProjectDueDateButton({
  projectId,
}: {
  projectId: string;
}): React.JSX.Element {
  const { store } = useDataLayer();
  const project = useProject(store, projectId);
  return (
    <DueDateButton
      dueDate={project?.dueDate ?? null}
      onChange={(iso) => updateProject(store, projectId, { dueDate: iso })}
      className="project-row-action"
    />
  );
}
