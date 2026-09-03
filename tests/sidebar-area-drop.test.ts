import { describe, expect, test } from 'bun:test';
import { resolveSidebarAreaDrop } from '../src/components/dnd/sidebarAreaDrop.ts';

// Slice layout used by the resolveSidebarAreaDrop cases: area-a holds
// root task t1, its subarea area-a-1 holds root task t2, t3 is a
// subtask of t1, and t4 is an inbox root. area-b is empty.
const TASKS = ['t1', 't2', 't3', 't4'];
const AREAS = ['area-a', 'area-a-1', 'area-b'];

// Direct placements: which area a task sits in at root level, or null
// when it sits in the inbox or under another task.
const PLACEMENTS: Record<string, string | null> = {
  t1: 'area-a',
  t2: 'area-a-1',
  t3: null, // subtask of t1
  t4: null, // inbox root
};

function isTask(id: string): boolean {
  return TASKS.includes(id);
}

function isArea(id: string): boolean {
  return AREAS.includes(id);
}

function directAreaIdOf(taskId: string): string | null {
  return PLACEMENTS[taskId] ?? null;
}

describe('resolveSidebarAreaDrop', () => {
  test('task dropped on an area it is not directly in returns that area id', () => {
    expect(resolveSidebarAreaDrop('t1', 'area-b', isTask, isArea, directAreaIdOf)).toBe('area-b');
  });

  test('inbox root task dropped on an area returns that area id', () => {
    expect(resolveSidebarAreaDrop('t4', 'area-a', isTask, isArea, directAreaIdOf)).toBe('area-a');
  });

  test('task dropped on its own direct area is a no-op (null)', () => {
    expect(resolveSidebarAreaDrop('t1', 'area-a', isTask, isArea, directAreaIdOf)).toBe(null);
  });

  test('subtask dropped on an area re-roots there (returns that area id)', () => {
    expect(resolveSidebarAreaDrop('t3', 'area-a', isTask, isArea, directAreaIdOf)).toBe('area-a');
  });

  test('null overId (drop outside any target) returns null', () => {
    expect(resolveSidebarAreaDrop('t1', null, isTask, isArea, directAreaIdOf)).toBe(null);
  });

  test('dragging a row onto itself returns null', () => {
    expect(resolveSidebarAreaDrop('t1', 't1', isTask, isArea, directAreaIdOf)).toBe(null);
  });

  test('area row dragged onto an area row returns null (sidebar tree owns area reorders)', () => {
    expect(resolveSidebarAreaDrop('area-b', 'area-a', isTask, isArea, directAreaIdOf)).toBe(null);
  });

  test('task dropped on a task row returns null (pane resolvers own that)', () => {
    expect(resolveSidebarAreaDrop('t1', 't2', isTask, isArea, directAreaIdOf)).toBe(null);
  });

  test('task dropped on a group container id returns null (pane resolvers own that)', () => {
    expect(
      resolveSidebarAreaDrop('t1', 'task-group:inbox:active', isTask, isArea, directAreaIdOf),
    ).toBe(null);
  });

  test('non-task dragId with non-area overId returns null', () => {
    expect(
      resolveSidebarAreaDrop('task-group:inbox:active', 't2', isTask, isArea, directAreaIdOf),
    ).toBe(null);
    expect(
      resolveSidebarAreaDrop(
        'task-group:inbox:active',
        'task-group:inbox:done',
        isTask,
        isArea,
        directAreaIdOf,
      ),
    ).toBe(null);
  });
});
