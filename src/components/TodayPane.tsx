import DuePane from './DuePane.tsx';
import { todayIso } from './dates.ts';

export default function TodayPane(): React.JSX.Element {
  const today = todayIso();
  return (
    <DuePane
      title="Today"
      from={today}
      to={today}
      storageKey="localaction.today"
      projectBadgeLabel="Due today"
    />
  );
}
