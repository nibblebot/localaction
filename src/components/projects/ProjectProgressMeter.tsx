/** Done/total progress meter shared by the project card header and the
 *  project detail pane header. `doneGroup` tints the bar green (the
 *  card sits in the Done status group). */
export default function ProjectProgressMeter({
  done,
  total,
  doneGroup,
}: {
  done: number;
  total: number;
  doneGroup?: boolean;
}): React.JSX.Element {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="project-row-progress" aria-label={`${done} of ${total} tasks done`}>
      <div
        className={`project-row-progress-bar${doneGroup ? ' project-row-progress-done' : ''}`}
      >
        <div className="project-row-progress-fill" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <span className="project-row-progress-count">
        {done} / {total}
      </span>
    </div>
  );
}
