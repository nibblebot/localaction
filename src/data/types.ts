/**
 * Typed entity shapes surfaced by the data layer.
 *
 * These describe the *value* a consumer sees after normalizeOrClassify —
 * not the raw TinyBase row. Optional relation columns (`parentId`,
 * `domainId`, `projectId`, `parentTaskId`, `entityId`) are normalised to
 * `null` rather than `undefined` / `''` so consumers can branch on a single
 * sentinel.
 *
 * Keep these in sync with `src/data/schema.ts` — the columns are the single
 * source of truth for what TinyBase stores, these types describe what the
 * app reads.
 */

import type { TaskStatus, NoteEntityType } from './schema.ts';

export interface Domain {
  id: string;
  name: string;
  /** Parent Domain id, or `null` for a top-level Domain. */
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  /** Owning Domain (or sub-Domain) id. */
  domainId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  /** Owning Project id (nil for reserved Recurring Tasks — phase 0 unused). */
  projectId: string | null;
  /** Parent Task id for arbitrary-depth nesting, or `null`. */
  parentTaskId: string | null;
  status: TaskStatus;
  /** Float ordering key for drag-reorder. */
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
  /** Id of the entity the note is attached to. */
  entityId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Input for `createDomain`. */
export interface DomainInput {
  name: string;
  parentId?: string | null;
}

/** Patch for `updateDomain`. */
export interface DomainPatch {
  name?: string;
  parentId?: string | null;
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