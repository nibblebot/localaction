import { describe, expect, it } from 'vitest';
import { parseRoute, formatRoute, routeEquals } from '../src/router.ts';
import type { Selection } from '../src/router.ts';

describe('parseRoute', () => {
  it('parses an area route', () => {
    expect(parseRoute('#/a/are1')).toEqual<Selection>({
      kind: 'area',
      id: 'are1',
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

  it('parses a project-notes route', () => {
    expect(parseRoute('#/p/proj1/notes')).toEqual<Selection>({
      kind: 'project-notes',
      id: 'proj1',
    });
  });

  it('collapses legacy project-pane deep links to home', () => {
    expect(parseRoute('#/p/proj1')).toEqual<Selection>({ kind: 'home' });
  });

  it('returns a home selection for empty / unknown hashes', () => {
    expect(parseRoute('')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/unknown/x')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/a/')).toEqual<Selection>({ kind: 'home' });
  });

  it('collapses legacy task / note / tag deep links to home', () => {
    expect(parseRoute('#/t/t1')).toEqual<Selection>({ kind: 'home' });
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
    expect(formatRoute({ kind: 'area', id: 'a1' })).toBe('#/a/a1');
    expect(formatRoute({ kind: 'project-notes', id: 'p1' })).toBe('#/p/p1/notes');
  });
});

describe('routeEquals', () => {
  it('compares selections structurally', () => {
    const a: Selection = { kind: 'area', id: 'a1' };
    expect(routeEquals(a, { kind: 'area', id: 'a1' })).toBe(true);
    expect(routeEquals(a, { kind: 'area', id: 'a2' })).toBe(false);
    expect(routeEquals(a, { kind: 'home' })).toBe(false);
  });

  it('treats project-notes selections with the same id as equal', () => {
    const a: Selection = { kind: 'project-notes', id: 'p1' };
    expect(routeEquals(a, { kind: 'project-notes', id: 'p1' })).toBe(true);
    expect(routeEquals(a, { kind: 'project-notes', id: 'p2' })).toBe(false);
    expect(routeEquals(a, { kind: 'area', id: 'p1' })).toBe(false);
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
});
