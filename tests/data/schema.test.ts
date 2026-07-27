import { describe, expect, it } from 'bun:test';
import {
  COLUMNS,
  NOTE_ENTITY_TYPE,
  TOMBSTONE_ENTITY_TYPE,
  TABLES,
  TASK_STATUS,
} from '../../src/data/schema.ts';

describe('schema constants', () => {
  it('exposes the six top-level tables the schema defines', () => {
    expect<string[]>(Object.values(TABLES).sort()).toEqual(
      [
        'areas',
        'notes',
        'projects',
        'sections',
        'tasks',
        'tombstones',
      ].sort(),
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

  it('keeps the task status enum consistent', () => {
    expect(TASK_STATUS).toEqual({ open: 'open', done: 'done' });
  });

  it('keeps the note entity-type enum aligned with the glossary', () => {
    expect(Object.keys(NOTE_ENTITY_TYPE).sort()).toEqual(
      ['area', 'project', 'task'],
    );
  });

  it('lets tombstones name sections without widening note targets', () => {
    expect(Object.keys(TOMBSTONE_ENTITY_TYPE).sort()).toEqual(
      ['area', 'project', 'section', 'task'],
    );
  });

  it('declares the section table columns', () => {
    expect(COLUMNS.sections).toEqual({
      id: 'id',
      name: 'name',
      projectId: 'projectId',
      order: 'order',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    });
  });
});
