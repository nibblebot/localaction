import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { MergeableStore } from 'tinybase';
import { getStore } from './store.ts';
import { startLocalPersistence } from './persistence.ts';
import { logWarn } from '../log.ts';
import { backfillOrder } from './order.ts';
import { installTombstoneReconciler } from './deletion.ts';
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
}

export function DataLayerProvider({
  children,
  offline = false,
}: DataLayerProviderProps): ReactElement {
  const store = useMemo(() => getStore(), []);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [sync, setSync] = useState<SyncClient | undefined>(undefined);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: 'idle' });

  const persistenceReadyRef = useRef(persistenceReady);
  persistenceReadyRef.current = persistenceReady;

  useEffect(() => {
    // Idempotently attach the tombstone reconciler to the store. It
    // sweeps after every transaction (local or merged) and cascades any
    // subtree rooted at a tombstoned target. ADR-0001.
    const uninstallReconciler = installTombstoneReconciler(store);

    if (offline) {
      // Offline mode skips persistence + sync; still normalise the
      // store once so any seeded rows from dev tests pick up `order`.
      backfillOrder(store);
      setPersistenceReady(true);
      return uninstallReconciler;
    }

    let cancelled = false;
    void (async () => {
      try {
        await startLocalPersistence();
        // After OPFS has loaded the persisted snapshot, fill in any
        // missing `order` cells. Idempotent — re-running is a no-op.
        backfillOrder(store);
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
    const client = getSyncClient();
    setSync(client);
    const unsubscribe = client.subscribe(setSyncStatus);

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

    // Tear down the WebSocket only when the page itself is going away.
    // React's StrictMode fake-unmount cleanup does NOT destroy the
    // client — that was the bug. `beforeunload` covers tab close,
    // navigation, and full reloads.
    const onBeforeUnload = (): void => {
      void destroySyncClient();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', onBeforeUnload);
    }
    return () => {
      cancelled = true;
      uninstallReconciler();
      unsubscribe();
      if (exposeDevHook && typeof window !== 'undefined') {
        const w = window as Window & { __LOCALACTION?: unknown };
        delete w.__LOCALACTION;
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', onBeforeUnload);
      }
      // Intentionally NOT calling destroySyncClient() here — see above.
    };
  }, [offline, store]);

  const value = useMemo<DataLayerValue>(
    () => ({ store, sync, syncStatus, persistenceReady }),
    [store, sync, syncStatus, persistenceReady],
  );

  return (
    <DataLayerContext.Provider value={value}>{children}</DataLayerContext.Provider>
  );
}
