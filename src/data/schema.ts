/**
 * TinyBase table and column names for LocalAction.
 *
 * Every entity in the app — Domain, Project, Task, Note — lives in a single
 * TinyBase table. The strings in this file are the single source of truth that
 * the rest of the app reaches through, so we never hand-write 'domains' / 'id'
 * / 'parentId' literals anywhere else.
 *
 * Why constants and not types: TinyBase itself does not enforce column types
 * at write time. Using string constants lets the rest of the app stay tiny and
 * keeps the data layer the only place that knows TinyBase's table shape. See
 * `src/data/README.md` and `docs/adr/0001-tinybase.md`.
 *
 * Schema versioning: phase 0 has no migrations (greenfield). When the schema
 * evolves, add a `schemaVersion` row in the mergeable store's `Values` and a
 * migration function on boot.
 */

export const TABLES = {
  domains: 'domains',
  projects: 'projects',
  tasks: 'tasks',
  notes: 'notes',
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];

/**
 * Column names per table. Mirrors the PRD's "Schema" subsection under
 * `Implementation Decisions`.
 */
export const COLUMNS = {
  domains: {
    id: 'id',
    name: 'name',
    parentId: 'parentId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  projects: {
    id: 'id',
    name: 'name',
    domainId: 'domainId',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  tasks: {
    id: 'id',
    title: 'title',
    projectId: 'projectId',
    parentTaskId: 'parentTaskId',
    status: 'status',
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
} as const;

export type DomainColumn = (typeof COLUMNS.domains)[keyof typeof COLUMNS.domains];
export type ProjectColumn = (typeof COLUMNS.projects)[keyof typeof COLUMNS.projects];
export type TaskColumn = (typeof COLUMNS.tasks)[keyof typeof COLUMNS.tasks];
export type NoteColumn = (typeof COLUMNS.notes)[keyof typeof COLUMNS.notes];

export const TASK_STATUS = {
  open: 'open',
  done: 'done',
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const NOTE_ENTITY_TYPE = {
  domain: 'domain',
  project: 'project',
  task: 'task',
} as const;

export type NoteEntityType =
  (typeof NOTE_ENTITY_TYPE)[keyof typeof NOTE_ENTITY_TYPE];
