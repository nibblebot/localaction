import type { TaskStatus, ProjectStatus, NoteEntityType, TombstoneEntityType } from './schema.ts';
import type { AreaColorId } from './colors.ts';

/**
 * A Task's owner (ADR-0001). Only the top-level Task carries a non-`task`
 * placement; a Sub-Task's placement is `{ kind: 'task', id }` pointing at
 * its parent, and ownership resolves by walking up the chain.
 *
 * `{ kind: 'inbox' }` is the unassociated root — derived into the Inbox.
 * `{ kind: 'section', id }` puts a top-level Task inside a project
 * Section; the owning Project resolves through the Section row.
 */
export type TaskPlacement =
  | { kind: 'project'; id: string }
  | { kind: 'area'; id: string }
  | { kind: 'section'; id: string }
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
  /** Date-only ISO string (`YYYY-MM-DD`), or null when no due date. */
  dueDate: string | null;
  /** Stored status (`active` when unset). Done stays derived from tasks. */
  status: ProjectStatus;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A named group of top-level Tasks inside a Project (glossary: Section).
 * Sections live only at the top level of a Project — they never nest
 * and never hold sub-tasks directly.
 */
export interface Section {
  id: string;
  name: string;
  projectId: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface SectionInput {
  name: string;
  projectId: string;
}

export interface SectionPatch {
  name?: string;
  order?: number;
}

export interface Task {
  id: string;
  title: string;
  placement: TaskPlacement;
  status: TaskStatus;
  /** Date-only ISO string (`YYYY-MM-DD`), or null when no due date. */
  dueDate: string | null;
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
  /** Set a date-only ISO string, or null to clear the due date. */
  dueDate?: string | null;
  status?: ProjectStatus;
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
  /** Set a date-only ISO string, or null to clear the due date. */
  dueDate?: string | null;
  order?: number;
}

/**
 * A permanent deletion record (ADR-0001). Typed tombstones make deletion
 * win over delayed or concurrent assignments after offline replicas merge.
 */
export interface Tombstone {
  id: string;
  entityType: TombstoneEntityType;
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
