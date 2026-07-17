import type { TaskStatus, NoteEntityType } from './schema.ts';
import type { AreaColorId } from './colors.ts';

export interface Area {
  id: string;
  name: string;
  parentId: string | null;
  color: AreaColorId;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  areaId: string | null;
  order: number;
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
  entityId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Person {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonInput {
  name: string;
  color?: string;
}

export interface PersonPatch {
  name?: string;
  color?: string;
}

export interface AreaInput {
  name: string;
  parentId?: string | null;
  color?: AreaColorId;
}

export interface AreaPatch {
  name?: string;
  parentId?: string | null;
  color?: AreaColorId;
}

export interface ProjectInput {
  name: string;
  areaId: string;
}

export interface ProjectPatch {
  name?: string;
  areaId?: string | null;
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
}
