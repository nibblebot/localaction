import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { MergeableStore } from 'tinybase';
import { getStore } from './store.ts';
import { startLocalPersistence } from './persistence.ts';
import { logWarn } from '../log.ts';
import { backfillOrder } from './order.ts';
import { installTombstoneReconciler } from './deletion.ts';
import {
  getSyncLog,
  installSyncLogCapture,
  recordConnectionEvent,
  setPushCaptureEnabled,
  subscribeLocalCommits,
} from './syncLog.ts';
import {
  getHasUnsyncedChanges,
  getUnsyncedTracker,
  subscribeUnsynced,
} from './unsynced.ts';
import {
  getSyncClient,
  destroySyncClient,
  type SyncClient,
  type SyncStatus,
} from './sync.ts';
import { DataLayerContext } from './dataLayerContext.ts';
import type { DataLayerValue } from './dataLayerContext.ts';

export type { DataLayerValue } from './dataLayerContext.ts';

export interface LocalActionDebug {
  readonly store: MergeableStore;
  readonly persistenceReady: boolean;
}

export interface DataLayerProviderProps {
  children: ReactNode;
  offline?: boolean;
  syncEnabled?: boolean;
}

export function DataLayerProvider({
  children,
  offline = false,
  syncEnabled = true,
}: DataLayerProviderProps): ReactElement {
  const store = useMemo(() => getStore(), []);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [sync, setSync] = useState<SyncClient | undefined>(undefined);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: 'idle' });
  const hasUnsyncedChanges = useSyncExternalStore(
    subscribeUnsynced,
    getHasUnsyncedChanges,
  );

  const persistenceReadyRef = useRef(persistenceReady);
  persistenceReadyRef.current = persistenceReady;

  useEffect(() => {
    // Idempotently attach the tombstone reconciler to the store. It
    // sweeps after every transaction (local or merged) and cascades any
    // subtree rooted at a tombstoned target.
    const uninstallReconciler = installTombstoneReconciler(store);

    // Attach sync capture to the store: inbound merges log `pull` events,
    // local commits log `push`/`sweep`. The log lives outside the store
    // (module ring buffer), so this can never feed back into sync.
    const uninstallSyncLog = installSyncLogCapture(store, getSyncLog());

    // Feed local commits to the unsynced tracker. `client` is only
    // defined in the syncEnabled branch below (the closure reads the
    // current value at commit time); when undefined, connected: false —
    // dirty then accumulates in offline mode, but the badge's `idle`
    // label ignores it, which is fine.
    let client: SyncClient | undefined;
    const unsubscribeLocalCommits = subscribeLocalCommits(() => {
      getUnsyncedTracker().noteLocalCommit(
        client?.status.kind === 'connected',
      );
    });

    if (offline) {
      // Offline mode skips persistence + sync; still normalise the
      // store once so any seeded rows from dev tests pick up `order`.
      backfillOrder(store);
      // Gate opens only after the one-time normalisation above, so the
      // backfill itself never appears in the sync log.
      setPushCaptureEnabled(true);
      setPersistenceReady(true);
      return () => {
        uninstallReconciler();
        uninstallSyncLog();
        unsubscribeLocalCommits();
      };
    }

    let cancelled = false;
    void (async () => {
      try {
        await startLocalPersistence();
        // After OPFS has loaded the persisted snapshot, fill in any
        // missing `order` cells. Idempotent — re-running is a no-op.
        backfillOrder(store);
        // Open the push gate only now: the OPFS load transaction and the
        // backfill must never appear in the sync log. Not disabled in
        // cleanup — module-level flag, matching the never-destroyed sync
        // client lifecycle.
        setPushCaptureEnabled(true);
      } catch (err) {
        logWarn('persistence', `disabled: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (!cancelled) setPersistenceReady(true);
    })();

    // Use the module-level singleton SyncClient. `getSyncClient()` lazily
    // constructs and starts the WebSocket exactly once for the lifetime
    // of the page, so React 19 StrictMode's mount → unmount → remount
    // cycle never opens (and tears down) a second WebSocket during the
    // page-load handshake. Without this, the first socket gets closed
    // mid-handshake on the fake unmount and Firefox logs "connection
    // interrupted while the page was loading" for ws://…/ws.
    //
    // Skip sync entirely when disabled (e.g. Playwright runs): the
    // OPFS layer above stays wired so persisted state still loads,
    // but no WebSocket is opened and no peer traffic is generated.
    let unsubscribe: (() => void) | undefined;
    let onBeforeUnload: (() => void) | undefined;
    if (syncEnabled) {
      client = getSyncClient();
      setSync(client);
      unsubscribe = client.subscribe((s) => {
        setSyncStatus(s);
        recordConnectionEvent(getSyncLog(), s);
      });
      // Tear down the WebSocket only when the page itself is going away.
      // React's StrictMode fake-unmount cleanup does NOT destroy the
      // client — that was the bug. `beforeunload` covers tab close,
      // navigation, and full reloads.
      onBeforeUnload = (): void => {
        void destroySyncClient();
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', onBeforeUnload);
      }
    }

    const exposeDevHook =
      typeof import.meta !== 'undefined' &&
      'env' in import.meta &&
      import.meta.env.DEV === true;
    if (exposeDevHook && typeof window !== 'undefined') {
      Object.defineProperty(window, '__LOCALACTION', {
        configurable: true,
        enumerable: false,
        get: () =>
          ({
            store,
            get persistenceReady() {
              return persistenceReadyRef.current;
            },
          }) satisfies LocalActionDebug,
      });
    }

    return () => {
      cancelled = true;
      uninstallReconciler();
      uninstallSyncLog();
      unsubscribeLocalCommits();
      unsubscribe?.();
      if (onBeforeUnload && typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', onBeforeUnload);
      }
      // Intentionally NOT calling destroySyncClient() here — see above.
    };
  }, [offline, syncEnabled, store]);

  // Dirty clears on the transition into `connected` (the mergeable
  // handshake converges both sides); other statuses keep state.
  useEffect(() => {
    getUnsyncedTracker().noteStatus(syncStatus);
  }, [syncStatus]);

  const value = useMemo<DataLayerValue>(
    () => ({ store, sync, syncStatus, persistenceReady, hasUnsyncedChanges }),
    [store, sync, syncStatus, persistenceReady, hasUnsyncedChanges],
  );

  return (
    <DataLayerContext.Provider value={value}>{children}</DataLayerContext.Provider>
  );
}
