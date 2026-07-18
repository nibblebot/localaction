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

  it('parses an inbox route', () => {
    expect(parseRoute('#/inbox')).toEqual<Selection>({ kind: 'inbox' });
  });

  it('parses a project route', () => {
    expect(parseRoute('#/p/proj1')).toEqual<Selection>({
      kind: 'project',
      id: 'proj1',
    });
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
    expect(formatRoute({ kind: 'area', id: 'a1' })).toBe('#/a/a1');
    expect(formatRoute({ kind: 'project', id: 'p1' })).toBe('#/p/p1');
  });
});

describe('routeEquals', () => {
  it('compares selections structurally', () => {
    const a: Selection = { kind: 'area', id: 'a1' };
    expect(routeEquals(a, { kind: 'area', id: 'a1' })).toBe(true);
    expect(routeEquals(a, { kind: 'area', id: 'a2' })).toBe(false);
    expect(routeEquals(a, { kind: 'home' })).toBe(false);
  });

  it('treats project selections with the same id as equal', () => {
    const a: Selection = { kind: 'project', id: 'p1' };
    expect(routeEquals(a, { kind: 'project', id: 'p1' })).toBe(true);
    expect(routeEquals(a, { kind: 'project', id: 'p2' })).toBe(false);
    expect(routeEquals(a, { kind: 'area', id: 'p1' })).toBe(false);
  });

  it('treats two inbox selections as equal', () => {
    expect(routeEquals({ kind: 'inbox' }, { kind: 'inbox' })).toBe(true);
    expect(routeEquals({ kind: 'inbox' }, { kind: 'home' })).toBe(false);
  });
});
