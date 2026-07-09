import { describe, expect, it } from 'vitest';
import {
  parseRoute,
  formatRoute,
  routeEquals,
} from '../src/router.ts';
import type { Selection } from '../src/router.ts';

describe('parseRoute', () => {
  it('parses a domain route', () => {
    expect(parseRoute('#/d/dom1')).toEqual<Selection>({
      kind: 'domain',
      id: 'dom1',
    });
  });

  it('parses project, task, and note routes', () => {
    expect(parseRoute('#/p/proj1')).toEqual<Selection>({ kind: 'project', id: 'proj1' });
    expect(parseRoute('#/t/task1')).toEqual<Selection>({ kind: 'task', id: 'task1' });
    expect(parseRoute('#/n/my-note')).toEqual<Selection>({ kind: 'note', slug: 'my-note' });
  });

  it('parses a tag route with URL-decoded value', () => {
    expect(parseRoute('#/g/work')).toEqual<Selection>({ kind: 'tag', value: 'work' });
    expect(parseRoute('#/g/sys%20admin')).toEqual<Selection>({ kind: 'tag', value: 'sys admin' });
  });

  it('parses a bare path without the leading hash', () => {
    expect(parseRoute('/d/dom1')).toEqual<Selection>({ kind: 'domain', id: 'dom1' });
  });

  it('returns a home selection for empty / unknown hashes', () => {
    expect(parseRoute('')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/unknown/x')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/d/')).toEqual<Selection>({ kind: 'home' });
  });
});

describe('formatRoute', () => {
  it('formats each selection kind', () => {
    expect(formatRoute({ kind: 'home' })).toBe('#/');
    expect(formatRoute({ kind: 'domain', id: 'd1' })).toBe('#/d/d1');
    expect(formatRoute({ kind: 'project', id: 'p1' })).toBe('#/p/p1');
    expect(formatRoute({ kind: 'task', id: 't1' })).toBe('#/t/t1');
    expect(formatRoute({ kind: 'note', slug: 'my-note' })).toBe('#/n/my-note');
    expect(formatRoute({ kind: 'tag', value: 'sys admin' })).toBe('#/g/sys%20admin');
  });
});

describe('routeEquals', () => {
  it('compares selections structurally', () => {
    const a: Selection = { kind: 'task', id: 't1' };
    expect(routeEquals(a, { kind: 'task', id: 't1' })).toBe(true);
    expect(routeEquals(a, { kind: 'task', id: 't2' })).toBe(false);
    expect(routeEquals(a, { kind: 'home' })).toBe(false);
  });

  it('compares tag selections by value', () => {
    expect(routeEquals({ kind: 'tag', value: 'a' }, { kind: 'tag', value: 'a' })).toBe(true);
    expect(routeEquals({ kind: 'tag', value: 'a' }, { kind: 'tag', value: 'b' })).toBe(false);
    expect(routeEquals({ kind: 'tag', value: 'a' }, { kind: 'home' })).toBe(false);
  });
});
