import { createContext, useContext } from 'react';
import type { MergeableStore } from 'tinybase';
import type { SyncClient, SyncStatus } from './sync.ts';

export interface DataLayerValue {
  store: MergeableStore;
  sync: SyncClient | undefined;
  syncStatus: SyncStatus;
  persistenceReady: boolean;
  hasUnsyncedChanges: boolean;
}

export const DataLayerContext = createContext<DataLayerValue | undefined>(undefined);

export function useDataLayer(): DataLayerValue {
  const value = useContext(DataLayerContext);
  if (!value) {
    throw new Error('useDataLayer must be used inside a <DataLayerProvider>');
  }
  return value;
}
