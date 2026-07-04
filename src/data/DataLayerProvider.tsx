import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import { getStore } from './store.ts';
import { startLocalPersistence } from './persistence.ts';
import { startSync, type SyncClient, type SyncStatus } from './sync.ts';
import { DataLayerContext } from './dataLayerContext.ts';
import type { DataLayerValue } from './dataLayerContext.ts';

export type { DataLayerValue } from './dataLayerContext.ts';

export interface LocalActionDebug {
  readonly store: ReturnType<typeof getStore>;
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
    if (offline) {
      setPersistenceReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await startLocalPersistence();
      } catch (err) {
        console.warn('[localaction] persistence disabled', err);
      }
      if (!cancelled) setPersistenceReady(true);
    })();

    const client = startSync();
    setSync(client);
    const unsubscribe = client.subscribe(setSyncStatus);
    client.start();

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
      unsubscribe();
      void client.destroy();
      setSync(undefined);
      if (exposeDevHook && typeof window !== 'undefined') {
        delete (window as { __LOCALACTION?: unknown }).__LOCALACTION;
      }
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