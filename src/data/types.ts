import type { TaskStatus, NoteEntityType } from './schema.ts';
import type { AreaColorId } from './colors.ts';

/**
 * A Task's owner (ADR-0001). Only the top-level Task carries a non-`task`
 * placement; a Sub-Task's placement is `{ kind: 'task', id }` pointing at
 * its parent, and ownership resolves by walking up the chain.
 *
 * `{ kind: 'inbox' }` is the unassociated root — derived into the Inbox.
 */
export type TaskPlacement =
  | { kind: 'project'; id: string }
  | { kind: 'area'; id: string }
  | { kind: 'task'; id: string }
  | { kind: 'inbox' };

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
  placement: TaskPlacement;
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
  /** Defaults to `{ kind: 'inbox' }` when omitted. */
  placement?: TaskPlacement;
  status?: TaskStatus;
  order?: number;
}

export interface TaskPatch {
  title?: string;
  placement?: TaskPlacement;
  status?: TaskStatus;
  order?: number;
}

/**
 * A permanent deletion record (ADR-0001). Typed tombstones make deletion
 * win over delayed or concurrent assignments after offline replicas merge.
 */
export interface Tombstone {
  id: string;
  entityType: NoteEntityType;
  entityId: string;
  deletedAt: string;
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
