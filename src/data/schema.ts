export const TABLES = {
  domains: 'domains',
  projects: 'projects',
  tasks: 'tasks',
  notes: 'notes',
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];

export const COLUMNS = {
  domains: {
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
    domainId: 'domainId',
    order: 'order',
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
