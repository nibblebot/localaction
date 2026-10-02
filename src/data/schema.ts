export const TABLES = {
  areas: 'areas',
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
  tasks: {
    id: 'id',
    title: 'title',
    /**
     * Discriminated placement reference: `area:<id>` (top-level task
     * inside an area), `task:<id>` (sub-task), or absent for an Inbox
     * root. One mergeable cell resolves a single owner under
     * last-writer-wins.
     */
    placement: 'placement',
    status: 'status',
    /**
     * Optional persisted shelf state, meaningful only on a root task.
     * Absent (cell deleted) means Active; `backlog` shelves the whole
     * subtree. `done` is not a stored cell — it stays derived from
     * task completion (see getRootTriState).
     */
    backlog: 'backlog',
    /**
     * Optional due date as a date-only ISO string (`YYYY-MM-DD`).
     * Absent (cell deleted) means no due date — null is never stored.
     */
    dueDate: 'dueDate',
    /**
     * ISO timestamp (`new Date().toISOString()`) captured the moment
     * a task transitions to `done`. Cleared (cell deleted) on reopen
     * and on tasks that were never completed. Drives the completed
     * history view; absent = never done.
     */
    completedAt: 'completedAt',
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
export type TaskColumn = (typeof COLUMNS.tasks)[keyof typeof COLUMNS.tasks];
export type NoteColumn = (typeof COLUMNS.notes)[keyof typeof COLUMNS.notes];
export type TombstoneColumn = (typeof COLUMNS.tombstones)[keyof typeof COLUMNS.tombstones];

export const TASK_STATUS = {
  open: 'open',
  done: 'done',
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const NOTE_ENTITY_TYPE = {
  area: 'area',
  task: 'task',
} as const;

export type NoteEntityType = (typeof NOTE_ENTITY_TYPE)[keyof typeof NOTE_ENTITY_TYPE];

/**
 * Entity types a tombstone can name. Mirrors `NOTE_ENTITY_TYPE`: only
 * areas and tasks are deletable owners.
 */
export const TOMBSTONE_ENTITY_TYPE = {
  ...NOTE_ENTITY_TYPE,
} as const;

export type TombstoneEntityType =
  (typeof TOMBSTONE_ENTITY_TYPE)[keyof typeof TOMBSTONE_ENTITY_TYPE];
