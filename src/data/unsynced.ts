import type { SyncStatus } from './sync.ts';

/**
 * Offline/unsynced tracker: answers "are there local commits the server
 * hasn't acknowledged yet?" for the sync-status badge. Dirty is set when
 * a local commit lands while the sync client is not `connected`; the
 * transition into `connected` clears it, because the mergeable handshake
 * converges both sides at that moment. Framework-free — React bindings
 * (`subscribeUnsynced`/`getHasUnsyncedChanges`) sit at the bottom beside
 * the process-wide singleton, mirroring `syncLog.ts`.
 *
 * Known, accepted race: a commit landing in the tiny window between
 * silent socket death and the `close` event (status still reads
 * `connected`) is treated as sent. The reconnect handshake converges the
 * data anyway, so the only cost is a briefly optimistic badge.
 */

export interface UnsyncedTracker {
  readonly hasUnsyncedChanges: boolean;
  /** Mark dirty iff the commit was NOT sent (client not connected). */
  noteLocalCommit(connected: boolean): void;
  /** Clear dirty on transition into `connected`; other kinds keep state. */
  noteStatus(status: SyncStatus): void;
  subscribe(listener: () => void): () => void;
}

export function createUnsyncedTracker(): UnsyncedTracker {
  let dirty = false;
  const listeners = new Set<() => void>();

  // Listeners fire only on a real flip, so `useSyncExternalStore` never
  // sees a spurious re-render from a repeated commit or status.
  const setDirty = (next: boolean): void => {
    if (next === dirty) return;
    dirty = next;
    for (const listener of listeners) listener();
  };

  return {
    get hasUnsyncedChanges() {
      return dirty;
    },
    noteLocalCommit(connected) {
      // A connected commit is sent synchronously on the transaction, so
      // it neither sets dirty nor clears dirty left over from earlier
      // offline commits — only noteStatus('connected') clears.
      if (!connected) setDirty(true);
    },
    noteStatus(status) {
      if (status.kind === 'connected') setDirty(false);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

let singleton: UnsyncedTracker | undefined;

/**
 * Returns the process-wide singleton UnsyncedTracker, creating it on
 * first call. Tests use {@link createUnsyncedTracker} for isolated
 * instances.
 */
export function getUnsyncedTracker(): UnsyncedTracker {
  if (!singleton) {
    singleton = createUnsyncedTracker();
  }
  return singleton;
}

// Stable `useSyncExternalStore` bindings for the singleton tracker.
// Identities are module-level so the hook never re-subscribes; the
// snapshot is a boolean, stable between flips by construction.
const tracker = getUnsyncedTracker();

export function subscribeUnsynced(listener: () => void): () => void {
  return tracker.subscribe(listener);
}

export function getHasUnsyncedChanges(): boolean {
  return tracker.hasUnsyncedChanges;
}
