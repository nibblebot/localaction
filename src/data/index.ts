export {
  TABLES,
  COLUMNS,
  TASK_STATUS,
  NOTE_ENTITY_TYPE,
  TOMBSTONE_ENTITY_TYPE,
} from './schema.ts';
export type {
  TableName,
  AreaColumn,
  TaskColumn,
  TaskStatus,
  NoteEntityType,
  TombstoneEntityType,
  TombstoneColumn,
} from './schema.ts';

export { getStore } from './store.ts';

export { useTableVersion, localDayOf } from './internal.ts';

export { startLocalPersistence, OPFS_FILE_NAME } from './persistence.ts';
export type { LocalActionDebug } from './DataLayerProvider.tsx';

export {
  startSync,
  getSyncClient,
  destroySyncClient,
} from './sync.ts';
export type { SyncClient, SyncClientOptions, SyncStatus } from './sync.ts';

export { DataLayerContext, useDataLayer } from './dataLayerContext.ts';
export type { DataLayerValue } from './dataLayerContext.ts';

export { DataLayerProvider } from './DataLayerProvider.tsx';
export type { DataLayerProviderProps } from './DataLayerProvider.tsx';

export type {
  Area,
  Task,
  Note,
  AreaInput,
  AreaPatch,
  TaskInput,
  TaskPatch,
  TaskPlacement,
  NoteInput,
  NotePatch,
  Tombstone,
} from './types.ts';

export {
  createArea,
  updateArea,
  getArea,
  useArea,
  descendantAreaIds,
} from './areas.ts';
export {
  createTask,
  createTaskAfter,
  updateTask,
  setTaskStatus,
  writeCompletionTimestamp,
  getTask,
  useTask,
  PLACEMENT_SEP,
  encodePlacement,
  decodePlacement,
  getPlacement,
  getRawPlacement,
  getRootPlacement,
  getDerivedStatus,
  useDerivedTaskStatus,
  getRootTriState,
  setRootBacklog,
  snapshotDerivedIntoStored,
  getSubtreeProgress,
  useSubtreeProgress,
  getRootTaskId,
  childTaskIds,
  descendantTaskIds,
  buildTaskTree,
  pruneDoneTasks,
  sortTaskIds,
  topLevelTaskIdsForPlacement,
  getInboxTaskIds,
  useInboxTaskIds,
  getAreaTaskIds,
  useAreaTaskIds,
  normalizeCompletedAt,
} from './tasks.ts';
export type { TaskTreeNode } from './tasks.ts';

export {
  moveArea,
  moveTask,
  moveRootToBacklog,
  backfillOrder,
  readSiblingOrders,
} from './order.ts';

export {
  createNote,
  updateNote,
  deleteNote,
  useNote,
  useAllNoteIds,
  useNoteIdsForEntity,
} from './notes.ts';

export {
  deleteArea,
  deleteTask,
  cascadeDeleteSubtree,
  reconcileTombstones,
  installTombstoneReconciler,
  isReconcileSweepActive,
} from './deletion.ts';

export {
  createSyncLog,
  getSyncLog,
  installSyncLogCapture,
  setPushCaptureEnabled,
  subscribeLocalCommits,
  subscribeSyncedRowAdds,
  recordConnectionEvent,
  summarizeTables,
  totalRows,
} from './syncLog.ts';
export type {
  SyncLog,
  SyncLogEvent,
  SyncLogOptions,
  SyncTableStat,
  SyncTableStats,
} from './syncLog.ts';

export {
  createUnsyncedTracker,
  getUnsyncedTracker,
  subscribeUnsynced,
  getHasUnsyncedChanges,
} from './unsynced.ts';
export type { UnsyncedTracker } from './unsynced.ts';

export {
  createSyncedAddRegistry,
  getSyncedAddRegistry,
  hasSyncedTaskAdd,
  clearSyncedTaskAdd,
} from './syncedAdds.ts';
export type { SyncedAddRegistry } from './syncedAdds.ts';

export { captureSubtree, restoreSubtree } from './undo.ts';
export type { SubtreeSnapshot } from './undo.ts';

export {
  tombstoneId,
  writeTombstone,
  hasTombstone,
  getTombstone,
  useTombstoneIds,
} from './tombstones.ts';

export { AREA_COLORS, isAreaColorId, areaColorHex } from './colors.ts';
export type { AreaColorId } from './colors.ts';

export {
  getAreaCounts,
  getNotesForAreaTree,
  useNotesForAreaTree,
  useAreaCounts,
  getDueItems,
  useDueItems,
  getCompletedItemsInRange,
  useCompletedItemsInRange,
} from './selectors.ts';
export type { AreaCount, DueItem, CompletedItem } from './selectors.ts';
