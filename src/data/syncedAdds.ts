/**
 * Synced-add registry: answers "did this task row just arrive via a sync
 * pull?" for the `task-line-synced-in` entrance animation. Fed by the
 * pull-capture seam (`subscribeSyncedRowAdds` in `syncLog.ts`, wired in
 * `DataLayerProvider`), consulted by the task row at mount.
 *
 * Marks are TTL'd rather than taken: a synced task may belong to a view
 * that isn't open, so its id is never consumed and must expire on its
 * own (lazy sweep on access — no timers). Reads are non-destructive
 * because StrictMode's double-mount renders the row twice and both
 * passes must see the mark. Batches over {@link MAX_BATCH} ids are
 * ignored outright: a bulk initial sync would otherwise storm every
 * visible row with the animation at once.
 *
 * Framework-free, mirroring `unsynced.ts`: a factory for tests, a
 * process-wide singleton, and module-level bindings beside it.
 */

export interface SyncedAddRegistry {
  /** Mark ids as sync-arrived. Batches over MAX_BATCH are dropped whole. */
  markSyncedTaskAdds(ids: readonly string[]): void;
  /** True while a fresh mark exists. Non-destructive (StrictMode-safe). */
  hasSyncedTaskAdd(id: string): boolean;
  /** Drop one id (the row calls this when its entrance animation ends). */
  clearSyncedTaskAdd(id: string): void;
}

export interface SyncedAddRegistryOptions {
  /** Clock seam for tests; defaults to `Date.now`. */
  now?: () => number;
}

const TTL_MS = 10_000;
const MAX_BATCH = 24;

export function createSyncedAddRegistry(
  options: SyncedAddRegistryOptions = {},
): SyncedAddRegistry {
  const now = options.now ?? Date.now;
  const marks = new Map<string, number>();

  const sweep = (): void => {
    const t = now();
    for (const [id, at] of marks) {
      if (t - at > TTL_MS) marks.delete(id);
    }
  };

  return {
    markSyncedTaskAdds(ids) {
      if (ids.length > MAX_BATCH) return;
      sweep();
      const at = now();
      for (const id of ids) marks.set(id, at);
    },
    hasSyncedTaskAdd(id) {
      sweep();
      return marks.has(id);
    },
    clearSyncedTaskAdd(id) {
      marks.delete(id);
    },
  };
}

let singleton: SyncedAddRegistry | undefined;

/**
 * Returns the process-wide singleton SyncedAddRegistry, creating it on
 * first call. Tests use {@link createSyncedAddRegistry} for isolated
 * instances.
 */
export function getSyncedAddRegistry(): SyncedAddRegistry {
  if (!singleton) {
    singleton = createSyncedAddRegistry();
  }
  return singleton;
}

// Stable module-level bindings for the singleton registry, mirroring
// unsynced.ts — the task row imports these directly.
const registry = getSyncedAddRegistry();

export function hasSyncedTaskAdd(id: string): boolean {
  return registry.hasSyncedTaskAdd(id);
}

export function clearSyncedTaskAdd(id: string): void {
  registry.clearSyncedTaskAdd(id);
}
