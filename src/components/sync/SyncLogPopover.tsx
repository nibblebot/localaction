import { useEffect, useRef } from 'react';
import { summarizeTables } from '../../data/index.ts';
import type { SyncLogEvent } from '../../data/index.ts';
import { formatRoute, SYNC_LOG } from '../../router.ts';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import { eventLine, relativeTime } from './syncLogFormat.ts';

export interface SyncLogPopoverProps {
  /** Full event log (oldest → newest); the popover shows the tail. */
  events: readonly SyncLogEvent[];
  onClose: () => void;
}

const MAX_ROWS = 20;

/**
 * Notifications popover behind the sync status badge: the ~20 most
 * recent sync events, newest first, one plain-language line each, and
 * a footer link into the full `#/sync-log` viewer. The badge owns
 * open state and the outside-click/Escape listeners; this component
 * owns focus containment (focus returns to the badge on close).
 */
export default function SyncLogPopover({
  events,
  onClose,
}: SyncLogPopoverProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, true);

  // Move focus into the dialog on open (mirrors the drawer's a11y
  // pattern); the focus trap returns focus to the badge on unmount.
  // The dialog itself takes focus so reading starts at the top —
  // rows are not interactive, the footer link is the only stop.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const now = Date.now();
  const recent = events.slice(-MAX_ROWS).reverse();

  return (
    <div
      className="sync-popover"
      role="dialog"
      aria-modal="true"
      aria-label="Sync activity"
      ref={dialogRef}
      tabIndex={-1}
    >
      {recent.length === 0 ? (
        <p className="sync-popover-empty">No sync activity yet.</p>
      ) : (
        <ul className="sync-popover-list">
          {recent.map((event) => (
            <li className="sync-popover-item" key={event.id}>
              <time
                className="sync-popover-item-time"
                dateTime={new Date(event.at).toISOString()}
              >
                {relativeTime(event.at, now)}
              </time>
              <span className="sync-popover-item-line">
                {eventLine(event, summarizeTables)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="sync-popover-footer">
        <a
          className="sync-popover-open"
          href={formatRoute(SYNC_LOG)}
          onClick={onClose}
        >
          Open full sync log
        </a>
      </div>
    </div>
  );
}
