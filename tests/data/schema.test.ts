import { describe, expect, it } from 'vitest';
import {
  COLUMNS,
  NOTE_ENTITY_TYPE,
  SELF_PERSON_ID,
  TABLES,
  TASK_STATUS,
} from '../../src/data/schema.ts';

describe('schema constants', () => {
  it('exposes the seven top-level tables the schema defines', () => {
    expect(Object.values(TABLES).sort()).toEqual(
      [
        'areas',
        'notes',
        'person_links',
        'persons',
        'projects',
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

  it('declares the person table columns and the self id constant', () => {
    expect(COLUMNS.persons).toEqual({
      id: 'id',
      name: 'name',
      color: 'color',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    });
    expect(COLUMNS.person_links).toEqual({
      id: 'id',
      personId: 'personId',
      entityType: 'entityType',
      entityId: 'entityId',
    });
    expect(SELF_PERSON_ID).toBe('self');
  });
});
