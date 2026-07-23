import DuePane from './DuePane.tsx';
import { rangeLabel, weekBoundsIso } from './dates.ts';

export default function WeekPane(): React.JSX.Element {
  const { from, to } = weekBoundsIso();
  return (
    <DuePane
      title={`Week · ${rangeLabel(from, to)}`}
      from={from}
      to={to}
      storageKey="localaction.week"
      projectBadgeLabel="Due this week"
    />
  );
}
