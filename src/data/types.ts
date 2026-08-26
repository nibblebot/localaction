import type { TaskStatus, NoteEntityType, TombstoneEntityType } from './schema.ts';
import type { AreaColorId } from './colors.ts';

/**
 * A Task's owner. Only the top-level Task carries a non-`task`
 * placement; a Sub-Task's placement is `{ kind: 'task', id }` pointing at
 * its parent, and ownership resolves by walking up the chain.
 *
 * `{ kind: 'inbox' }` is the unassociated root — derived into the Inbox.
 */
export type TaskPlacement =
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

export interface Task {
  id: string;
  title: string;
  placement: TaskPlacement;
  status: TaskStatus;
  /**
   * Shelved state, meaningful only on a root task. `true` when the
   * `backlog` cell is present; absent = Active. `done` stays derived
   * from task completion (see getRootTriState).
   */
  backlog: boolean;
  /** Date-only ISO string (`YYYY-MM-DD`), or null when no due date. */
  dueDate: string | null;
  /**
   * ISO timestamp (`YYYY-MM-DDTHH:mm:ss.sssZ`) captured the moment the
   * task transitioned to `done`, or null when the task has never been
   * completed (or was reopened). Backs the completed history view.
   */
  completedAt: string | null;
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
 * A permanent deletion record. Typed tombstones make deletion
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
