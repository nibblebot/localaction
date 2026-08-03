import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useDataLayer } from '../../data/index.ts';
import SyncLogPopover from '../sync/SyncLogPopover.tsx';
import { badgeLabel, badgeTitle } from '../sync/syncLogFormat.ts';
import { getSyncLogEvents, subscribeSyncLog } from '../sync/syncLogStore.ts';

/**
 * Sync status badge + notifications popover. The badge itself is a
 * toggle button (dot + plain-language label, unchanged from the
 * original read-only badge) that opens the recent-activity popover;
 * the error-state retry button stays a separate control so it never
 * toggles the popover. Rendered twice in the shell — sidebar footer
 * on desktop, fixed top-right slot on mobile — each instance manages
 * its own popover state.
 */
export default function SyncStatusBadge(): React.JSX.Element {
  const { syncStatus, sync, hasUnsyncedChanges } = useDataLayer();
  const events = useSyncExternalStore(subscribeSyncLog, getSyncLogEvents);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const label = badgeLabel(syncStatus, hasUnsyncedChanges);
  const title = badgeTitle(syncStatus, hasUnsyncedChanges);

  // Close on Escape and on any press outside the badge + popover
  // (AppearanceMenu pattern). Focus containment lives in the popover.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      className={`sync-status sync-popover-root sync-status-${syncStatus.kind}${hasUnsyncedChanges ? ' sync-status-dirty' : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="sync-status-toggle"
        title={title}
        aria-label={`${label} — show sync activity`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sync-status-dot" aria-hidden="true" />
        {/* The live region stays on the label (as the original badge's
            role="status" did) so the popover never sits inside it. */}
        <span className="sync-status-label" role="status">
          {label}
        </span>
      </button>
      {syncStatus.kind === 'error' && (
        <button
          type="button"
          className="sync-status-retry"
          title="Retry sync"
          aria-label="Retry sync"
          onClick={(e) => {
            e.stopPropagation();
            sync?.retry();
          }}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#retry-icon" />
          </svg>
        </button>
      )}
      {open && <SyncLogPopover events={events} onClose={() => setOpen(false)} />}
    </div>
  );
}
