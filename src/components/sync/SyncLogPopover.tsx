import { useEffect, useRef } from 'react';
import { summarizeTables } from '../../data/index.ts';
import type { SyncLogEvent } from '../../data/index.ts';
import { formatRoute, SYNC_LOG } from '../../router.ts';
import { useFocusTrap } from '../hooks/useFocusTrap.ts';
import { compactPopoverRows, relativeTime } from './syncLogFormat.ts';

export interface SyncLogPopoverProps {
  /** Full event log (oldest → newest); the popover shows the tail. */
  events: readonly SyncLogEvent[];
  onClose: () => void;
}

const MAX_ROWS = 20;

/**
 * Notifications popover behind the sync status badge: the ~20 most
 * recent sync events, newest first, one plain-language line each, and
 * a footer link into the full `#/sync-log` viewer. Connect/retry bursts
 * are collapsed into single episode rows (see compactPopoverRows) so a
 * reconnect storm reads as "Reconnected after N retries", not a stack of
 * Connecting/Retry lines. The badge owns open state and the
 * outside-click/Escape listeners; this component owns focus containment
 * (focus returns to the badge on close).
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
  const recent = compactPopoverRows(events, summarizeTables).slice(-MAX_ROWS).reverse();

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
          {recent.map((row) => (
            <li className="sync-popover-item" key={row.id}>
              <time className="sync-popover-item-time" dateTime={new Date(row.at).toISOString()}>
                {relativeTime(row.at, now)}
              </time>
              <span className="sync-popover-item-line">{row.line}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="sync-popover-footer">
        <a className="sync-popover-open" href={formatRoute(SYNC_LOG)} onClick={onClose}>
          Open full sync log
        </a>
      </div>
    </div>
  );
}
