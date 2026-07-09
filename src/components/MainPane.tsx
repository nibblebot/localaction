import { useDataLayer, useStoreVersion } from '../data/index.ts';
import { useSelection } from './useSelection.ts';
import { useResolvedSelection } from './useBreadcrumbs.ts';
import DomainEditor from './DomainEditor.tsx';
import ProjectEditor from './ProjectEditor.tsx';
import TaskDetail from './TaskDetail.tsx';

export default function MainPane(): React.JSX.Element {
  const { store } = useDataLayer();
  const { selection } = useSelection();
  const { focus } = useResolvedSelection(selection);
  useStoreVersion(store);

  return (
    <main className="main" aria-label="Editor">
      <div className="main-body">
        {focus?.kind === 'domain' && <DomainEditor id={focus.id} />}
        {focus?.kind === 'project' && <ProjectEditor id={focus.id} />}
        {focus?.kind === 'task' && <TaskDetail id={focus.id} />}
        {(!focus || focus.kind === 'home') && <EmptyState />}
      </div>
    </main>
  );
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="main-empty">
      <h2>Welcome to LocalAction</h2>
      <p>Pick a domain from the sidebar to get started, or create a new one.</p>
    </div>
  );
}
