export const TABLES = {
  areas: 'areas',
  projects: 'projects',
  sections: 'sections',
  tasks: 'tasks',
  notes: 'notes',
  persons: 'persons',
  person_links: 'person_links',
  tombstones: 'tombstones',
} as const;

/**
 * App-level schema version. Bumping this triggers a clean cutover wipe of
 * any persisted store (OPFS client snapshot + server SQLite) on load —
 * see `reconcileSchemaVersion`. There is no row migration (ADR-0001).
 */
export const SCHEMA_VERSION = 3;

/**
 * Keyed-value id recording the schema version last applied to a persisted
 * store. TinyBase's value map is flat, so this is a single top-level
 * value (not a cell) that survives persistence and sync alongside the
 * row data.
 */
export const SCHEMA_VERSION_VALUE_ID = 'schemaVersion';

export type TableName = (typeof TABLES)[keyof typeof TABLES];

export const SELF_PERSON_ID = 'self';

export const COLUMNS = {
  areas: {
    id: 'id',
    name: 'name',
    parentId: 'parentId',
    color: 'color',
    order: 'order',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  projects: {
    id: 'id',
    name: 'name',
    areaId: 'areaId',
    /**
     * Optional due date as a date-only ISO string (`YYYY-MM-DD`).
     * Absent (cell deleted) means no due date — null is never stored.
     */
    dueDate: 'dueDate',
    /**
     * Optional persisted status. Absent (cell deleted) means
     * `active` — only `backlog` is ever stored. `done` is not a
     * stored status: it stays derived from task completion.
     */
    status: 'status',
    order: 'order',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  sections: {
    id: 'id',
    name: 'name',
    projectId: 'projectId',
    order: 'order',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  tasks: {
    id: 'id',
    title: 'title',
    /**
     * Discriminated placement reference (ADR-0001): `area:<id>`,
     * `project:<id>`, `section:<id>` (top-level task inside a project
     * Section), `task:<id>` (sub-task), or absent for an Inbox root.
     * One mergeable cell resolves a single owner under last-writer-wins.
     */
    placement: 'placement',
    status: 'status',
    /**
     * Optional due date as a date-only ISO string (`YYYY-MM-DD`).
     * Absent (cell deleted) means no due date — null is never stored.
     */
    dueDate: 'dueDate',
    order: 'order',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  notes: {
    id: 'id',
    slug: 'slug',
    title: 'title',
    body: 'body',
    entityType: 'entityType',
    entityId: 'entityId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  persons: {
    id: 'id',
    name: 'name',
    color: 'color',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  person_links: {
    id: 'id',
    personId: 'personId',
    entityType: 'entityType',
    entityId: 'entityId',
  },
  tombstones: {
    id: 'id',
    entityType: 'entityType',
    entityId: 'entityId',
    deletedAt: 'deletedAt',
  },
} as const;

export type AreaColumn = (typeof COLUMNS.areas)[keyof typeof COLUMNS.areas];
export type ProjectColumn = (typeof COLUMNS.projects)[keyof typeof COLUMNS.projects];
export type SectionColumn = (typeof COLUMNS.sections)[keyof typeof COLUMNS.sections];
export type TaskColumn = (typeof COLUMNS.tasks)[keyof typeof COLUMNS.tasks];
export type NoteColumn = (typeof COLUMNS.notes)[keyof typeof COLUMNS.notes];
export type PersonColumn = (typeof COLUMNS.persons)[keyof typeof COLUMNS.persons];
export type PersonLinkColumn =
  (typeof COLUMNS.person_links)[keyof typeof COLUMNS.person_links];
export type TombstoneColumn =
  (typeof COLUMNS.tombstones)[keyof typeof COLUMNS.tombstones];

export const TASK_STATUS = {
  open: 'open',
  done: 'done',
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

/**
 * A Project's stored status. `active` is the default (stored as an
 * absent cell); `backlog` shelves the project out of the Active group
 * without touching its tasks. A Project reads **Done** only when every
 * task in it is done — that state is derived, never stored here.
 */
export const PROJECT_STATUS = {
  active: 'active',
  backlog: 'backlog',
} as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export const NOTE_ENTITY_TYPE = {
  area: 'area',
  project: 'project',
  task: 'task',
} as const;

export type NoteEntityType =
  (typeof NOTE_ENTITY_TYPE)[keyof typeof NOTE_ENTITY_TYPE];

/**
 * Entity types a tombstone can name. Superset of `NOTE_ENTITY_TYPE`:
 * sections never carry notes or person links, but deleting one must
 * still leave a typed tombstone so the deletion wins after sync merges.
 */
export const TOMBSTONE_ENTITY_TYPE = {
  ...NOTE_ENTITY_TYPE,
  section: 'section',
} as const;

export type TombstoneEntityType =
  (typeof TOMBSTONE_ENTITY_TYPE)[keyof typeof TOMBSTONE_ENTITY_TYPE];
