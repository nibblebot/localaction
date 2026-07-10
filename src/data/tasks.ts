import { useRow, useRowIds } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES, TASK_STATUS } from './schema.ts';
import type { TaskStatus } from './schema.ts';
import { newId, nowIso, normalizeRelation, row } from './internal.ts';
import type { Task, TaskInput, TaskPatch } from './types.ts';

export function createTask(store: MergeableStore, input: TaskInput): string {
  const id = newId();
  const ts = nowIso();
  const status = input.status ?? TASK_STATUS.open;
  const parent = input.parentTaskId ?? null;
  store.setRow(
    TABLES.tasks,
    id,
    row({
      [COLUMNS.tasks.title]: input.title,
      [COLUMNS.tasks.projectId]: input.projectId,
      [COLUMNS.tasks.parentTaskId]: parent,
      [COLUMNS.tasks.status]: status,
      [COLUMNS.tasks.order]: 0,
      [COLUMNS.tasks.createdAt]: ts,
      [COLUMNS.tasks.updatedAt]: ts,
    }),
  );
  return id;
}

export function updateTask(store: MergeableStore, id: string, patch: TaskPatch): void {
  if (!store.hasRow(TABLES.tasks, id)) return;
  const next: Record<string, string | undefined> = {
    [COLUMNS.tasks.updatedAt]: nowIso(),
  };
  if (patch.title !== undefined) next[COLUMNS.tasks.title] = patch.title;
  if (patch.status !== undefined) next[COLUMNS.tasks.status] = patch.status;
  if (patch.projectId === null) {
    store.delCell(TABLES.tasks, id, COLUMNS.tasks.projectId);
  } else if (patch.projectId !== undefined) {
    next[COLUMNS.tasks.projectId] = patch.projectId;
  }
  if (patch.parentTaskId === null) {
    store.delCell(TABLES.tasks, id, COLUMNS.tasks.parentTaskId);
  } else if (patch.parentTaskId !== undefined) {
    next[COLUMNS.tasks.parentTaskId] = patch.parentTaskId;
  }
  store.setPartialRow(TABLES.tasks, id, row(next));
}

export function setTaskStatus(store: MergeableStore, id: string, status: TaskStatus): void {
  if (!store.hasRow(TABLES.tasks, id)) return;
  store.setPartialRow(
    TABLES.tasks,
    id,
    row({
      [COLUMNS.tasks.status]: status,
      [COLUMNS.tasks.updatedAt]: nowIso(),
    }),
  );
}

export function deleteTask(store: MergeableStore, id: string): void {
  store.delRow(TABLES.tasks, id);
}

export function getTask(store: MergeableStore, id: string): Task | undefined {
  const row = store.getRow(TABLES.tasks, id);
  if (!row || Object.keys(row).length === 0) return undefined;
  return {
    id,
    title: String(row[COLUMNS.tasks.title] ?? ''),
    projectId: normalizeRelation(row[COLUMNS.tasks.projectId]),
    parentTaskId: normalizeRelation(row[COLUMNS.tasks.parentTaskId]),
    status: (String(row[COLUMNS.tasks.status] ?? TASK_STATUS.open)) as TaskStatus,
    order: Number(row[COLUMNS.tasks.order] ?? 0),
    createdAt: String(row[COLUMNS.tasks.createdAt] ?? ''),
    updatedAt: String(row[COLUMNS.tasks.updatedAt] ?? ''),
  };
}

/**
 * Non-reactive: walk all tasks under a project (top-level + nested).
 * Use `useTasksForProjectDeep` from React to subscribe.
 */
export function getTasksForProjectDeep(store: MergeableStore, projectId: string): string[] {
  const out: string[] = [];
  for (const id of store.getRowIds(TABLES.tasks)) {
    if (store.getCell(TABLES.tasks, id, COLUMNS.tasks.projectId) !== projectId) continue;
    out.push(id);
  }
  return out;
}

function collectChildIds(
  store: MergeableStore,
  parentId: string,
  out: string[],
): void {
  for (const id of store.getRowIds(TABLES.tasks)) {
    if (store.getCell(TABLES.tasks, id, COLUMNS.tasks.parentTaskId) === parentId) {
      out.push(id);
      collectChildIds(store, id, out);
    }
  }
}

/**
 * Reactive counterpart: returns the full flattened list of task ids in
 * the project (top-level + nested). Subscribes to the tasks table so any
 * descendant change re-renders callers.
 */
export function useTasksForProjectDeep(store: MergeableStore, projectId: string): string[] {
  // Subscribe to the tasks table so any descendant change re-renders.
  useRowIds(TABLES.tasks, store);
  const out: string[] = [];
  for (const id of store.getRowIds(TABLES.tasks)) {
    if (store.getCell(TABLES.tasks, id, COLUMNS.tasks.projectId) !== projectId) continue;
    if (store.getCell(TABLES.tasks, id, COLUMNS.tasks.parentTaskId) !== undefined) continue;
    out.push(id);
  }
  // Recurse to gather nested children; `collectChildIds` walks via parent
  // pointer which the table now provides.
  for (const tid of [...out]) collectChildIds(store, tid, out);
  return out;
}

export function useTask(store: MergeableStore, id: string | undefined): Task | undefined {
  const row = useRow(TABLES.tasks, id ?? '', store);
  if (!id || !row || Object.keys(row).length === 0) return undefined;
  return {
    id,
    title: String(row[COLUMNS.tasks.title] ?? ''),
    projectId: normalizeRelation(row[COLUMNS.tasks.projectId]),
    parentTaskId: normalizeRelation(row[COLUMNS.tasks.parentTaskId]),
    status: (String(row[COLUMNS.tasks.status] ?? TASK_STATUS.open)) as TaskStatus,
    order: Number(row[COLUMNS.tasks.order] ?? 0),
    createdAt: String(row[COLUMNS.tasks.createdAt] ?? ''),
    updatedAt: String(row[COLUMNS.tasks.updatedAt] ?? ''),
  };
}
