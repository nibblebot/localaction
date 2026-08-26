import { describe, expect, it } from 'bun:test';
import {
  COLUMNS,
  NOTE_ENTITY_TYPE,
  TOMBSTONE_ENTITY_TYPE,
  TABLES,
  TASK_STATUS,
} from '../../src/data/schema.ts';

describe('schema constants', () => {
  it('exposes the four top-level tables the schema defines', () => {
    expect<string[]>(Object.values(TABLES).sort()).toEqual(
      ['areas', 'notes', 'tasks', 'tombstones'].sort(),
    );
  });

  it('uses snake_case column names that match the PRD schema', () => {
    expect(COLUMNS.areas).toMatchObject({
      id: 'id',
      name: 'name',
      parentId: 'parentId',
    });
    expect(COLUMNS.tasks.status).toBe('status');
    expect(COLUMNS.tasks.order).toBe('order');
    expect(COLUMNS.notes.slug).toBe('slug');
  });

  it('declares the completedAt column on tasks (regression: spec for completedAt history)', () => {
    expect(COLUMNS.tasks.completedAt).toBe('completedAt');
  });

  it('declares the backlog column on tasks (root shelf state, absent = Active)', () => {
    expect(COLUMNS.tasks.backlog).toBe('backlog');
  });

  it('keeps the task status enum consistent', () => {
    expect(TASK_STATUS).toEqual({ open: 'open', done: 'done' });
  });

  it('keeps the note entity-type enum aligned with the glossary (areas + tasks only)', () => {
    expect(Object.keys(NOTE_ENTITY_TYPE).sort()).toEqual(['area', 'task']);
  });

  it('narrows tombstone entity types to the deletable owners (areas + tasks)', () => {
    expect(Object.keys(TOMBSTONE_ENTITY_TYPE).sort()).toEqual(['area', 'task']);
  });
});