import { useRow, useRowIds } from 'tinybase/ui-react';
import type { MergeableStore } from 'tinybase';
import { COLUMNS, TABLES, TASK_STATUS } from './schema.ts';
import type { TaskStatus } from './schema.ts';
import { newId, nowIso, normalizeRelation, row } from './internal.ts';
import type { Task, TaskInput, TaskPatch } from './types.ts';

export function nextTaskOrder(
  store: MergeableStore,
  projectId: string,
  parentTaskId: string | null,
): number {
  const siblings = store
    .getRowIds(TABLES.tasks)
    .filter((id) => {
      const pid = normalizeRelation(store.getCell(TABLES.tasks, id, COLUMNS.tasks.projectId));
      const ptask = normalizeRelation(store.getCell(TABLES.tasks, id, COLUMNS.tasks.parentTaskId));
      return (
        pid === projectId &&
        ptask === parentTaskId &&
        (ptask === null || store.hasRow(TABLES.tasks, ptask))
      );
    })
    .map((id) => Number(store.getCell(TABLES.tasks, id, COLUMNS.tasks.order) ?? 0));
  return siblings.length === 0 ? 0 : Math.max(...siblings) + 1;
}

export function createTask(store: MergeableStore, input: TaskInput): string {
  const id = newId();
  const ts = nowIso();
  const status = input.status ?? TASK_STATUS.open;
  const parent = input.parentTaskId ?? null;
  const order = input.order ?? nextTaskOrder(store, input.projectId, parent);
  store.setRow(
    TABLES.tasks,
    id,
    row({
      [COLUMNS.tasks.title]: input.title,
      [COLUMNS.tasks.projectId]: input.projectId,
      [COLUMNS.tasks.parentTaskId]: parent,
      [COLUMNS.tasks.status]: status,
      [COLUMNS.tasks.order]: order,
      [COLUMNS.tasks.createdAt]: ts,
      [COLUMNS.tasks.updatedAt]: ts,
    }),
  );
  return id;
}

export function updateTask(store: MergeableStore, id: string, patch: TaskPatch): void {
  if (!store.hasRow(TABLES.tasks, id)) return;
  const next: Record<string, string | number | undefined> = {
    [COLUMNS.tasks.updatedAt]: nowIso(),
  };
  if (patch.title !== undefined) next[COLUMNS.tasks.title] = patch.title;
  if (patch.status !== undefined) next[COLUMNS.tasks.status] = patch.status;
  if (patch.order !== undefined) next[COLUMNS.tasks.order] = patch.order;
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
  store.setPartialRow(TABLES.tasks, id, {
    [COLUMNS.tasks.status]: status,
    [COLUMNS.tasks.updatedAt]: nowIso(),
  });
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

export function getTasksForProject(store: MergeableStore, projectId: string): string[] {
  return store
    .getRowIds(TABLES.tasks)
    .filter((id) => {
      const pid = store.getCell(TABLES.tasks, id, COLUMNS.tasks.projectId);
      const ptask = store.getCell(TABLES.tasks, id, COLUMNS.tasks.parentTaskId);
      const orphan = ptask !== undefined && !store.hasRow(TABLES.tasks, String(ptask));
      return pid === projectId && (ptask === undefined || orphan);
    })
    .sort((a, b) =>
      Number(store.getCell(TABLES.tasks, a, COLUMNS.tasks.order) ?? 0) -
      Number(store.getCell(TABLES.tasks, b, COLUMNS.tasks.order) ?? 0),
    );
}

export function isTaskOrphaned(store: MergeableStore, id: string): boolean {
  const parent = normalizeRelation(store.getCell(TABLES.tasks, id, COLUMNS.tasks.parentTaskId));
  return parent !== null && !store.hasRow(TABLES.tasks, parent);
}

export function getChildTasks(store: MergeableStore, parentTaskId: string): string[] {
  return store
    .getRowIds(TABLES.tasks)
    .filter((id) => store.getCell(TABLES.tasks, id, COLUMNS.tasks.parentTaskId) === parentTaskId)
    .sort((a, b) =>
      Number(store.getCell(TABLES.tasks, a, COLUMNS.tasks.order) ?? 0) -
      Number(store.getCell(TABLES.tasks, b, COLUMNS.tasks.order) ?? 0),
    );
}

export function getOrphanedTaskIds(store: MergeableStore): string[] {
  return store.getRowIds(TABLES.tasks).filter((id) => {
    const parent = normalizeRelation(store.getCell(TABLES.tasks, id, COLUMNS.tasks.parentTaskId));
    return parent !== null && !store.hasRow(TABLES.tasks, parent);
  });
}


export function useTasks(store: MergeableStore, projectId: string): string[] {
  const allIds = useRowIds(TABLES.tasks, store);
  return allIds
    .filter((id) => store.getCell(TABLES.tasks, id, COLUMNS.tasks.projectId) === projectId)
    .filter((id) => store.getCell(TABLES.tasks, id, COLUMNS.tasks.parentTaskId) === undefined)
    .sort(
      (a, b) =>
        Number(store.getCell(TABLES.tasks, a, COLUMNS.tasks.order) ?? 0) -
        Number(store.getCell(TABLES.tasks, b, COLUMNS.tasks.order) ?? 0),
    );
}

export function useChildTasks(store: MergeableStore, parentTaskId: string): string[] {
  const allIds = useRowIds(TABLES.tasks, store);
  return allIds
    .filter((id) => store.getCell(TABLES.tasks, id, COLUMNS.tasks.parentTaskId) === parentTaskId)
    .sort(
      (a, b) =>
        Number(store.getCell(TABLES.tasks, a, COLUMNS.tasks.order) ?? 0) -
        Number(store.getCell(TABLES.tasks, b, COLUMNS.tasks.order) ?? 0),
    );
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