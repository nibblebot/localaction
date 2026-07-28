export const TABLES = {
  areas: 'areas',
  projects: 'projects',
  sections: 'sections',
  tasks: 'tasks',
  notes: 'notes',
  tombstones: 'tombstones',
} as const;


export type TableName = (typeof TABLES)[keyof typeof TABLES];

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
     * Discriminated placement reference: `area:<id>`,
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
 * without touching its tasks. A Project reads **Done** only when it
 * has at least one task and every task in it is done — that state is
 * derived, never stored here (an empty project stays Active).
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
 * sections never carry notes, but deleting one must still leave a
 * typed tombstone so the deletion wins after sync merges.
 */
export const TOMBSTONE_ENTITY_TYPE = {
  ...NOTE_ENTITY_TYPE,
  section: 'section',
} as const;

export type TombstoneEntityType =
  (typeof TOMBSTONE_ENTITY_TYPE)[keyof typeof TOMBSTONE_ENTITY_TYPE];
