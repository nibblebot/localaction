import { useDataLayer } from '../data/index.ts';
import type { SyncStatus } from '../data/index.ts';

export default function SyncStatusBadge(): React.JSX.Element {
  const { syncStatus } = useDataLayer();
  return (
    <div className={`sync-status sync-status-${syncStatus.kind}`} role="status">
      {labelFor(syncStatus)}
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
