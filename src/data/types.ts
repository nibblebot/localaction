import type { TaskStatus, NoteEntityType } from './schema.ts';
import type { DomainColorId } from './colors.ts';

export interface Domain {
  id: string;
  name: string;
  parentId: string | null;
  color: DomainColorId;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  domainId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  projectId: string | null;
  parentTaskId: string | null;
  status: TaskStatus;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  id: string;
  slug: string;
  title: string;
  body: string;
  entityType: NoteEntityType;
  entityId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DomainInput {
  name: string;
  parentId?: string | null;
  color?: DomainColorId;
}

export interface DomainPatch {
  name?: string;
  parentId?: string | null;
  color?: DomainColorId;
}

export interface ProjectInput {
  name: string;
  domainId: string;
}

export interface ProjectPatch {
  name?: string;
  domainId?: string | null;
}

export interface TaskInput {
  title: string;
  projectId: string;
  parentTaskId?: string | null;
  status?: TaskStatus;
  order?: number;
}

export interface TaskPatch {
  title?: string;
  projectId?: string | null;
  parentTaskId?: string | null;
  status?: TaskStatus;
  order?: number;
}

export interface NoteInput {
  title: string;
  body?: string;
  entityType: NoteEntityType;
  entityId: string;
}

export interface NotePatch {
  title?: string;
  body?: string;
  entityType?: NoteEntityType;
  entityId?: string | null;
}