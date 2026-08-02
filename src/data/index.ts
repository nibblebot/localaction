export {
  TABLES,
  COLUMNS,
  TASK_STATUS,
  PROJECT_STATUS,
  NOTE_ENTITY_TYPE,
  TOMBSTONE_ENTITY_TYPE,
} from './schema.ts';
export type {
  TableName,
  AreaColumn,
  ProjectColumn,
  SectionColumn,
  TaskColumn,
  TaskStatus,
  ProjectStatus,
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
  Project,
  Section,
  SectionInput,
  SectionPatch,
  Task,
  Note,
  AreaInput,
  AreaPatch,
  ProjectInput,
  ProjectPatch,
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
  createProject,
  updateProject,
  useProject,
} from './projects.ts';
export {
  createSection,
  updateSection,
  getSection,
  useSection,
  getSectionIdsForProject,
  useSectionIdsForProject,
} from './sections.ts';
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
  getEffectiveTaskStatus,
  useEffectiveTaskStatus,
  childTaskIds,
  descendantTaskIds,
  buildTaskTree,
  pruneDoneTasks,
  sortTaskIds,
  topLevelTaskIdsForPlacement,
  getTasksForProjectDeep,
  useTasksForProjectDeep,
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
  moveSection,
  reorderProject,
  moveProjectToStatus,
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
  deleteProject,
  deleteTask,
  deleteSection,
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
  getProjectRollups,
  useAreaCounts,
  useProjectRollups,
  getDueItems,
  useDueItems,
  getCompletedItemsInRange,
  useCompletedItemsInRange,
} from './selectors.ts';
export type { AreaCount, ProjectRollup, DueItem, CompletedItem } from './selectors.ts';
