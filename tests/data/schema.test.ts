import { describe, expect, it } from 'vitest';
import {
  COLUMNS,
  NOTE_ENTITY_TYPE,
  TABLES,
  TASK_STATUS,
} from '../../src/data/schema.ts';

describe('schema constants', () => {
  it('exposes the four top-level tables the PRD defines', () => {
    expect(Object.values(TABLES).sort()).toEqual(
      ['areas', 'notes', 'projects', 'tasks'].sort(),
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
});