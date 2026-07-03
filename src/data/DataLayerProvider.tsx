/**
 * Single React entry point into the data layer.
 *
 * Hides TinyBase from the rest of the app behind a typed context. Children get
 * `useDataLayer()` to read the store directly, the sync status, and the sync
 * client. CRUD hooks (useDomains / createDomain / …) are added in
 * 02-domain-crud and live in sibling files.
 *
 * Why a Provider, not a module-level singleton: tests can mount the tree with
 * a custom provider, and React StrictMode double-renders the effect safely.
 *
 * See ADR-0001 (storage / sync) and ADR-0002 (conflict resolution) for the
 * architectural decisions behind this seam.
 */

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import { getStore } from './store.ts';
import { startLocalPersistence } from './persistence.ts';
import { startSync, type SyncClient, type SyncStatus } from './sync.ts';
import { DataLayerContext } from './dataLayerContext.ts';
import type { DataLayerValue } from './dataLayerContext.ts';

export type { DataLayerValue } from './dataLayerContext.ts';

export interface DataLayerProviderProps {
  children: ReactNode;
  /**
   * Disable persistence + sync. Used by the smoke script and by SSR / test
   * harnesses that don't have IndexedDB or a network.
   */
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

  useEffect(() => {
    if (offline) {
      setPersistenceReady(true);
      return;
    }
    startLocalPersistence();
    setPersistenceReady(true);

    const client = startSync();
    setSync(client);
    const unsubscribe = client.subscribe(setSyncStatus);
    client.start();

    return () => {
      unsubscribe();
      void client.destroy();
      setSync(undefined);
    };
  }, [offline]);

  const value = useMemo<DataLayerValue>(
    () => ({ store, sync, syncStatus, persistenceReady }),
    [store, sync, syncStatus, persistenceReady],
  );

  return (
    <DataLayerContext.Provider value={value}>{children}</DataLayerContext.Provider>
  );
}
