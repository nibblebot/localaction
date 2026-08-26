import { describe, expect, it } from 'bun:test';
import { parseRoute, formatRoute, routeEquals } from '../src/router.ts';
import type { Selection } from '../src/router.ts';

describe('parseRoute', () => {
  it('parses an area route', () => {
    expect(parseRoute('#/a/are1')).toEqual<Selection>({
      kind: 'area',
      id: 'are1',
    });
  });

  it('parses a task route', () => {
    expect(parseRoute('#/t/task1')).toEqual<Selection>({
      kind: 'task',
      id: 'task1',
    });
  });

  it('parses a bare path without the leading hash', () => {
    expect(parseRoute('/a/are1')).toEqual<Selection>({ kind: 'area', id: 'are1' });
  });

  it('parses a today route', () => {
    expect(parseRoute('#/today')).toEqual<Selection>({ kind: 'today' });
  });

  it('parses a today route without the leading hash', () => {
    expect(parseRoute('/today')).toEqual<Selection>({ kind: 'today' });
  });

  it('parses a week route', () => {
    expect(parseRoute('#/week')).toEqual<Selection>({ kind: 'week' });
  });

  it('parses a week route without the leading hash', () => {
    expect(parseRoute('/week')).toEqual<Selection>({ kind: 'week' });
  });

  it('parses an inbox route', () => {
    expect(parseRoute('#/inbox')).toEqual<Selection>({ kind: 'inbox' });
  });

  it('parses a sync-log route', () => {
    expect(parseRoute('#/sync-log')).toEqual<Selection>({ kind: 'sync-log' });
  });

  it('parses a sync-log route without the leading hash', () => {
    expect(parseRoute('/sync-log')).toEqual<Selection>({ kind: 'sync-log' });
  });

  it('falls back to home for legacy project deep links', () => {
    expect(parseRoute('#/p/proj1')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/p/proj1/notes')).toEqual<Selection>({ kind: 'home' });
  });

  it('returns a home selection for empty / unknown hashes', () => {
    expect(parseRoute('')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/unknown/x')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/a/')).toEqual<Selection>({ kind: 'home' });
  });

  it('collapses legacy note / tag deep links to home', () => {
    expect(parseRoute('#/n/some-slug')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/g/work')).toEqual<Selection>({ kind: 'home' });
  });
});

describe('formatRoute', () => {
  it('formats each selection kind', () => {
    expect(formatRoute({ kind: 'home' })).toBe('#/');
    expect(formatRoute({ kind: 'inbox' })).toBe('#/inbox');
    expect(formatRoute({ kind: 'today' })).toBe('#/today');
    expect(formatRoute({ kind: 'week' })).toBe('#/week');
    expect(formatRoute({ kind: 'sync-log' })).toBe('#/sync-log');
    expect(formatRoute({ kind: 'area', id: 'a1' })).toBe('#/a/a1');
    expect(formatRoute({ kind: 'task', id: 't1' })).toBe('#/t/t1');
  });
});

describe('routeEquals', () => {
  it('compares selections structurally', () => {
    const a: Selection = { kind: 'area', id: 'a1' };
    expect(routeEquals(a, { kind: 'area', id: 'a1' })).toBe(true);
    expect(routeEquals(a, { kind: 'area', id: 'a2' })).toBe(false);
    expect(routeEquals(a, { kind: 'home' })).toBe(false);
  });

  it('treats task selections with the same id as equal', () => {
    const a: Selection = { kind: 'task', id: 't1' };
    expect(routeEquals(a, { kind: 'task', id: 't1' })).toBe(true);
    expect(routeEquals(a, { kind: 'task', id: 't2' })).toBe(false);
    expect(routeEquals(a, { kind: 'area', id: 't1' })).toBe(false);
  });

  it('treats two today selections as equal', () => {
    expect(routeEquals({ kind: 'today' }, { kind: 'today' })).toBe(true);
    expect(routeEquals({ kind: 'today' }, { kind: 'inbox' })).toBe(false);
    expect(routeEquals({ kind: 'today' }, { kind: 'home' })).toBe(false);
  });

  it('treats two week selections as equal', () => {
    expect(routeEquals({ kind: 'week' }, { kind: 'week' })).toBe(true);
    expect(routeEquals({ kind: 'week' }, { kind: 'today' })).toBe(false);
    expect(routeEquals({ kind: 'week' }, { kind: 'inbox' })).toBe(false);
  });

  it('treats two inbox selections as equal', () => {
    expect(routeEquals({ kind: 'inbox' }, { kind: 'inbox' })).toBe(true);
    expect(routeEquals({ kind: 'inbox' }, { kind: 'home' })).toBe(false);
  });

  it('treats two sync-log selections as equal', () => {
    expect(routeEquals({ kind: 'sync-log' }, { kind: 'sync-log' })).toBe(true);
    expect(routeEquals({ kind: 'sync-log' }, { kind: 'home' })).toBe(false);
  });

  it('round-trips the sync-log route through parse and format', () => {
    const sel: Selection = { kind: 'sync-log' };
    expect(parseRoute(formatRoute(sel))).toEqual<Selection>(sel);
  });
});