/**
 * Public surface of the data layer seam.
 *
 * Anything in `src/components/` should import from here, never from tinybase
 * directly. New entity hooks (useDomains / createDomain / …) are added in
 * future issues and re-exported through this file.
 *
 * See `src/data/README.md` for the seam-level contract.
 */

export { TABLES, COLUMNS, TASK_STATUS, NOTE_ENTITY_TYPE } from './schema.ts';
export type {
  TableName,
  DomainColumn,
  ProjectColumn,
  TaskColumn,
  NoteColumn,
  TaskStatus,
  NoteEntityType,
} from './schema.ts';

export { getStore } from './store.ts';

export { startLocalPersistence, INDEXED_DB_NAME } from './persistence.ts';

export { startSync } from './sync.ts';
export type { SyncClient, SyncClientOptions, SyncStatus } from './sync.ts';

export { DataLayerContext, useDataLayer } from './dataLayerContext.ts';
export type { DataLayerValue } from './dataLayerContext.ts';

export { DataLayerProvider } from './DataLayerProvider.tsx';
export type { DataLayerProviderProps } from './DataLayerProvider.tsx';
