import { describe, expect, test } from 'bun:test';
import {
  containerId,
  headerContainerId,
  parseGroupId,
  resolveTaskGroupDrop,
} from '../src/components/dnd/rootTaskGroupDrop.ts';
import type { RootPosition } from '../src/components/dnd/rootTaskGroupDrop.ts';

// Slice layout used by the resolveTaskGroupDrop cases: area A has
// active [t1, t2, t3] and backlog [t4]; area B has active [t5].
const POSITIONS: Record<string, RootPosition> = {
  t1: { sliceKey: 'a', group: 'active' },
  t2: { sliceKey: 'a', group: 'active' },
  t3: { sliceKey: 'a', group: 'active' },
  t4: { sliceKey: 'a', group: 'backlog' },
  t5: { sliceKey: 'b', group: 'active' },
};

function findPosition(id: string): RootPosition | null {
  return POSITIONS[id] ?? null;
}

function idsIn(pos: RootPosition): string[] {
  if (pos.sliceKey === 'a' && pos.group === 'active') return ['t1', 't2', 't3'];
  if (pos.sliceKey === 'a' && pos.group === 'backlog') return ['t4'];
  if (pos.sliceKey === 'b' && pos.group === 'active') return ['t5'];
  return [];
}

describe('parseGroupId', () => {
  test('parses container and group header ids alike', () => {
    expect(parseGroupId(containerId('a', 'backlog'))).toEqual({ scopeKey: 'a', group: 'backlog' });
    expect(parseGroupId(headerContainerId('a', 'active'))).toEqual({ scopeKey: 'a', group: 'active' });
  });

  test('keeps colons inside the scope key (group is the trailing segment)', () => {
    expect(parseGroupId(headerContainerId('a:b', 'active'))).toEqual({
      scopeKey: 'a:b',
      group: 'active',
    });
  });

  test('rejects malformed ids', () => {
    expect(parseGroupId('task-group-head::active')).toBeNull();
    expect(parseGroupId('task-group:a:done')).toBeNull();
    expect(parseGroupId('t1')).toBeNull();
  });
});

describe('resolveTaskGroupDrop', () => {
  test('Backlog header drop shelves an active root (appends)', () => {
    const resolved = resolveTaskGroupDrop(
      't1',
      headerContainerId('a', 'backlog'),
      findPosition,
      idsIn,
    );
    expect(resolved).toEqual({ kind: 'shelve', beforeId: undefined });
  });

  test('Backlog zone drop shelves and appends (empty group included)', () => {
    const resolved = resolveTaskGroupDrop(
      't1',
      containerId('b', 'backlog'),
      findPosition,
      idsIn,
    );
    expect(resolved).toEqual({ kind: 'shelve', beforeId: undefined });
  });

  test('Active header drop unshelves a backlog root (appends)', () => {
    const resolved = resolveTaskGroupDrop(
      't4',
      headerContainerId('a', 'active'),
      findPosition,
      idsIn,
    );
    expect(resolved).toEqual({ kind: 'unshelve', beforeId: undefined });
  });

  test('cross-group row drop lands right before the over row', () => {
    const resolved = resolveTaskGroupDrop('t4', 't2', findPosition, idsIn);
    expect(resolved).toEqual({ kind: 'unshelve', beforeId: 't2' });
  });

  test('same-slice same-group drop moving down past the dragged row shifts the gap', () => {
    // t1 dropped on t3: the hidden dragged row keeps its slot, so the
    // landing gap shifts past t3 — which IS the last row, so the
    // translated sibling is undefined and the drop is a no-op (null).
    const resolved = resolveTaskGroupDrop('t1', 't3', findPosition, idsIn);
    expect(resolved).toBeNull();
  });

  test('same-slice same-group drop moving up inserts before the over row', () => {
    const resolved = resolveTaskGroupDrop('t3', 't1', findPosition, idsIn);
    expect(resolved).toEqual({ kind: 'reorder', beforeId: 't1' });
  });

  test('cross-slice same-group drop reorders with the target slice as beforeId', () => {
    // t1 (area A active) dropped on t5 (area B active): ownership
    // change — the caller maps the target slice's placement.
    const resolved = resolveTaskGroupDrop('t1', 't5', findPosition, idsIn);
    expect(resolved).toEqual({ kind: 'reorder', beforeId: 't5' });
  });

  test('no meaningful target returns null', () => {
    expect(resolveTaskGroupDrop('t1', 't1', findPosition, idsIn)).toBeNull();
    expect(resolveTaskGroupDrop('nope', 't1', findPosition, idsIn)).toBeNull();
    expect(resolveTaskGroupDrop('t1', 'nope', findPosition, idsIn)).toBeNull();
  });
});
