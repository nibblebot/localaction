import { useAreaCounts, useDataLayer } from '../data/index.ts';
import { useSelection } from './context/useSelection.ts';
import AreaView from './area/AreaView.tsx';
import TaskPane from './tasks/TaskPane.tsx';
import InboxPane from './inbox/InboxPane.tsx';
import TodayPane from './due/TodayPane.tsx';
import WeekPane from './due/WeekPane.tsx';
import SyncLogPane from './sync/SyncLogPane.tsx';
import EmptyState from './shared/EmptyState.tsx';

/**
 * Main-pane route switch: renders the pane for the current selection —
 * an area view, a task detail pane, the inbox, the today/week due panes,
 * the sync-log viewer, or the home welcome. Each pane owns its own data
 * and view state; this component only reads the selection and picks the
 * branch, so adding a route is one case here.
 */
export default function MainPane(): React.JSX.Element {
  const { selection } = useSelection();

  if (selection.kind === 'task') {
    return <TaskPane taskId={selection.id} />;
  }

  if (selection.kind === 'inbox') {
    return <InboxPane />;
  }

  if (selection.kind === 'today') {
    return <TodayPane />;
  }

  if (selection.kind === 'week') {
    return <WeekPane />;
  }

  if (selection.kind === 'sync-log') {
    return <SyncLogPane />;
  }

  if (selection.kind === 'area') {
    return <AreaView areaId={selection.id} />;
  }

  // `home` (and any future default): the counts-aware welcome.
  return <HomePane />;
}

/** First-run / welcome screen — nudges toward creating or picking an area. */
function HomePane(): React.JSX.Element {
  const { store } = useDataLayer();
  const counts = useAreaCounts(store);
  return (
    <EmptyState
      message={
        counts.length === 0
          ? 'Create an area in the sidebar to get started.'
          : 'Pick an area from the sidebar to get started.'
      }
    />
  );
}
