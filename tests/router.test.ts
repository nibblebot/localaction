import { describe, expect, it } from 'vitest';
import { parseRoute, formatRoute, routeEquals } from '../src/router.ts';
import type { Selection } from '../src/router.ts';

describe('parseRoute', () => {
  it('parses a domain route', () => {
    expect(parseRoute('#/d/dom1')).toEqual<Selection>({
      kind: 'domain',
      id: 'dom1',
    });
  });

  it('parses a bare path without the leading hash', () => {
    expect(parseRoute('/d/dom1')).toEqual<Selection>({ kind: 'domain', id: 'dom1' });
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
    expect(parseRoute('#/d/')).toEqual<Selection>({ kind: 'home' });
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
    expect(formatRoute({ kind: 'domain', id: 'd1' })).toBe('#/d/d1');
    expect(formatRoute({ kind: 'project', id: 'p1' })).toBe('#/p/p1');
  });
});

describe('routeEquals', () => {
  it('compares selections structurally', () => {
    const a: Selection = { kind: 'domain', id: 'd1' };
    expect(routeEquals(a, { kind: 'domain', id: 'd1' })).toBe(true);
    expect(routeEquals(a, { kind: 'domain', id: 'd2' })).toBe(false);
    expect(routeEquals(a, { kind: 'home' })).toBe(false);
  });

  it('treats project selections with the same id as equal', () => {
    const a: Selection = { kind: 'project', id: 'p1' };
    expect(routeEquals(a, { kind: 'project', id: 'p1' })).toBe(true);
    expect(routeEquals(a, { kind: 'project', id: 'p2' })).toBe(false);
    expect(routeEquals(a, { kind: 'domain', id: 'p1' })).toBe(false);
  });
});
