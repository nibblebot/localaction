import { getSyncLog } from '../../data/index.ts';
import type { SyncLogEvent } from '../../data/index.ts';

/**
 * Stable `useSyncExternalStore` bindings for the singleton sync log,
 * shared by the badge popover and the `#/sync-log` viewer. Identities
 * are module-level so the hook never re-subscribes; the log replaces
 * its events array on mutation, so the snapshot is stable between
 * mutations by contract.
 */

const syncLog = getSyncLog();

export function subscribeSyncLog(listener: () => void): () => void {
  return syncLog.subscribe(listener);
}

export function getSyncLogEvents(): readonly SyncLogEvent[] {
  return syncLog.events;
}
