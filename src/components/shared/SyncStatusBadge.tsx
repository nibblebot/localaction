import { useDataLayer } from '../../data/index.ts';
import type { SyncStatus } from '../../data/index.ts';

export default function SyncStatusBadge(): React.JSX.Element {
  const { syncStatus, sync } = useDataLayer();
  const label = labelFor(syncStatus);
  return (
    <div className={`sync-status sync-status-${syncStatus.kind}`} role="status" title={label}>
      <span className="sync-status-dot" aria-hidden="true" />
      <span className="sync-status-label">{label}</span>
      {syncStatus.kind === 'error' && (
        <button
          type="button"
          className="sync-status-retry"
          title="Retry sync"
          aria-label="Retry sync"
          onClick={() => sync?.retry()}
        >
          <svg className="svg-icon" aria-hidden="true">
            <use href="/icons.svg#retry-icon" />
          </svg>
        </button>
      )}
    </div>
  );
}

function labelFor(status: SyncStatus): string {
  switch (status.kind) {
    case 'idle':
      return 'Local only';
    case 'connecting':
      return 'Syncing…';
    case 'connected':
      return 'Synced';
    case 'retrying':
      return `Retry #${status.attempt}…`;
    case 'error':
      return 'Sync error';
  }
}
