export {
  TABLES,
  COLUMNS,
  TASK_STATUS,
  NOTE_ENTITY_TYPE,
  SELF_PERSON_ID,
} from './schema.ts';
export type {
  TableName,
  AreaColumn,
  ProjectColumn,
  TaskColumn,
  NoteColumn,
  PersonColumn,
  PersonLinkColumn,
  TaskStatus,
  NoteEntityType,
} from './schema.ts';

export { getStore } from './store.ts';

export { useStoreVersion } from './internal.ts';

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
  Task,
  Note,
  Person,
  AreaInput,
  AreaPatch,
  ProjectInput,
  ProjectPatch,
  TaskInput,
  TaskPatch,
  NoteInput,
  NotePatch,
  PersonInput,
  PersonPatch,
} from './types.ts';

export {
  createArea,
  updateArea,
  deleteArea,
  getArea,
  useArea,
} from './areas.ts';
export {
  createProject,
  updateProject,
  deleteProject,
  useProject,
} from './projects.ts';
export {
  createTask,
  updateTask,
  deleteTask,
  setTaskStatus,
  getTasksForProjectDeep,
  useTasksForProjectDeep,
  useTask,
} from './tasks.ts';

export {
  reorderArea,
  reorderProject,
  reorderTask,
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
  effectiveCastForArea,
  effectiveCastForEntity,
  effectiveSetForEntity,
  effectiveCastSetForArea,
  effectiveCastSetForEntity,
  presentPersonIds,
  useEffectiveSet,
  useEffectiveCast,
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
} from './selectors.ts';
export type { AreaCount, ProjectRollup } from './selectors.ts';
