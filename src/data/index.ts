export {
  TABLES,
  COLUMNS,
  TASK_STATUS,
  PROJECT_STATUS,
  NOTE_ENTITY_TYPE,
  TOMBSTONE_ENTITY_TYPE,
  SELF_PERSON_ID,
  SCHEMA_VERSION,
  SCHEMA_VERSION_VALUE_ID,
} from './schema.ts';

export { reconcileSchemaVersion } from './schemaVersion.ts';
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
  PersonColumn,
  PersonLinkColumn,
} from './schema.ts';

export { getStore } from './store.ts';

export { useTableVersion } from './internal.ts';

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
  Person,
  AreaInput,
  AreaPatch,
  ProjectInput,
  ProjectPatch,
  TaskInput,
  TaskPatch,
  TaskPlacement,
  NoteInput,
  NotePatch,
  PersonInput,
  PersonPatch,
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
} from './deletion.ts';

export { captureSubtree, restoreSubtree } from './undo.ts';
export type { SubtreeSnapshot } from './undo.ts';

export {
  tombstoneId,
  writeTombstone,
  hasTombstone,
  getTombstone,
  useTombstoneIds,
} from './tombstones.ts';

export {
  initials,
  nameDerivedHue,
  createPerson,
  updatePerson,
  deletePerson,
  getPerson,
  usePerson,
  useAllPersonIds,
  ensureSelfPerson,
} from './persons.ts';

export {
  setEntityPersons,
  addEntityPerson,
  removeEntityPerson,
  getEntityPersonIds,
  getEntityIdsForPerson,
  useEntityPersonIds,
} from './personLinks.ts';

export {
  peopleForEntity,
  presentPersonIds,
  sortPersonIds,
  usePeopleForEntity,
  usePresentPersonIds,
} from './personSelectors.ts';

export {
  areaHasMatch,
  getFilteredAreaCounts,
  useDimmedAreaIds,
  useFilteredAreaCounts,
  useHiddenCount,
} from './personFilter.ts';
export type { FilteredAreaCount } from './personFilter.ts';

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
} from './selectors.ts';
export type { AreaCount, ProjectRollup, DueItem } from './selectors.ts';
