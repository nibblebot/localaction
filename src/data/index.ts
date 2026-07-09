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
  Domain,
  Project,
  Task,
  Note,
  DomainInput,
  DomainPatch,
  ProjectInput,
  ProjectPatch,
  TaskInput,
  TaskPatch,
  NoteInput,
  NotePatch,
} from './types.ts';

export {
  createDomain,
  updateDomain,
  deleteDomain,
  getDomain,
  getDomainPath,
  getTopLevelDomainIds,
  getChildDomainIds,
  getAllDomainIdsFlat,
  getOrphanedDomainIds,
  getAllDomainIds,
  useDomains,
  useDomain,
  useChildDomains,
  useOrphanedDomainIds,
} from './domains.ts';

export {
  createProject,
  updateProject,
  deleteProject,
  getProject,
  getProjectsForDomain,
  getOrphanedProjectIds,
  isProjectOrphaned,
  useProjects,
  useProject,
} from './projects.ts';

export {
  createTask,
  updateTask,
  deleteTask,
  setTaskStatus,
  getTask,
  getTasksForProject,
  getChildTasks,
  getOrphanedTaskIds,
  isTaskOrphaned,
  nextTaskOrder,
  useTasks,
  useChildTasks,
  useTask,
} from './tasks.ts';

export {
  createNote,
  updateNote,
  deleteNote,
  getNote,
  getNotesForEntity,
  getNoteBySlug,
  getNoteSlugLockReason,
  useNotesForEntity,
  useAllNoteIds,
  useNote,
  useNoteBySlug,
  useNoteIndex,
  useNoteIdForSlug,
} from './notes.ts';

export { slugify } from './slug.ts';

export {
  extractTags,
  getAllTagCounts,
  getNoteIdsForTag,
  useAllTagCounts,
  useNoteIdsForTag,
} from './tags.ts';
export type { TagCount } from './tags.ts';
