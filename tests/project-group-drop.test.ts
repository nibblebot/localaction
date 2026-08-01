import { describe, expect, test } from 'bun:test';
import {
  containerId,
  headerContainerId,
  parseContainerId,
  resolveProjectDrop,
} from '../src/components/dnd/projectGroupDrop.ts';
import type { SlicePosition } from '../src/components/dnd/projectGroupDrop.ts';

// Slice layout used by the resolveProjectDrop cases: area A has
// active [p1, p2, p3] and backlog [p4]; area B has active [p5].
const POSITIONS: Record<string, SlicePosition> = {
  p1: { areaId: 'a', group: 'active' },
  p2: { areaId: 'a', group: 'active' },
  p3: { areaId: 'a', group: 'active' },
  p4: { areaId: 'a', group: 'backlog' },
  p5: { areaId: 'b', group: 'active' },
};

function findPosition(id: string): SlicePosition | null {
  return POSITIONS[id] ?? null;
}

function idsIn(pos: SlicePosition): string[] {
  if (pos.areaId === 'a' && pos.group === 'active') return ['p1', 'p2', 'p3'];
  if (pos.areaId === 'a' && pos.group === 'backlog') return ['p4'];
  if (pos.areaId === 'b' && pos.group === 'active') return ['p5'];
  return [];
}

describe('parseContainerId', () => {
  test('parses slice container and group header ids alike', () => {
    expect(parseContainerId(containerId('a', 'backlog'))).toEqual({ areaId: 'a', group: 'backlog' });
    expect(parseContainerId(headerContainerId('a', 'active'))).toEqual({ areaId: 'a', group: 'active' });
  });

  test('keeps colons inside the area id (group is the trailing segment)', () => {
    expect(parseContainerId(headerContainerId('a:b', 'active'))).toEqual({
      areaId: 'a:b',
      group: 'active',
    });
  });

  test('rejects malformed ids', () => {
    expect(parseContainerId('project-group-head::active')).toBeNull();
    expect(parseContainerId('project-group:a:done')).toBeNull();
    expect(parseContainerId('p1')).toBeNull();
  });
});

describe('resolveProjectDrop', () => {
  test('group header drop appends to that area slice (empty group included)', () => {
    const resolved = resolveProjectDrop(
      'p1',
      headerContainerId('a', 'backlog'),
      findPosition,
      idsIn,
    );
    expect(resolved).toEqual({
      source: { areaId: 'a', group: 'active' },
      target: { areaId: 'a', group: 'backlog' },
      beforeId: undefined,
    });
  });

  test('cross-group row drop lands right before the over row', () => {
    const resolved = resolveProjectDrop('p4', 'p2', findPosition, idsIn);
    expect(resolved).toEqual({
      source: { areaId: 'a', group: 'backlog' },
      target: { areaId: 'a', group: 'active' },
      beforeId: 'p2',
    });
  });

  test('same-group drop moving down past the dragged row shifts the gap', () => {
    // p1 dropped on p3: without translation beforeId would be p3, but
    // the hidden dragged row keeps its slot, so the gap lands after p3.
    const resolved = resolveProjectDrop('p1', 'p3', findPosition, idsIn);
    expect(resolved).toEqual({
      source: { areaId: 'a', group: 'active' },
      target: { areaId: 'a', group: 'active' },
      beforeId: undefined,
    });
  });

  test('same-group drop moving up inserts before the over row', () => {
    const resolved = resolveProjectDrop('p3', 'p1', findPosition, idsIn);
    expect(resolved).toEqual({
      source: { areaId: 'a', group: 'active' },
      target: { areaId: 'a', group: 'active' },
      beforeId: 'p1',
    });
  });

  test('no meaningful target returns null', () => {
    expect(resolveProjectDrop('p1', 'p1', findPosition, idsIn)).toBeNull();
    expect(resolveProjectDrop('nope', 'p1', findPosition, idsIn)).toBeNull();
    expect(resolveProjectDrop('p1', 'nope', findPosition, idsIn)).toBeNull();
  });
});
