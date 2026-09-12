import { describe, expect, it } from 'bun:test';
import { parseRoute, formatRoute, routeEquals } from '../src/router.ts';
import type { Selection } from '../src/router.ts';

describe('parseRoute', () => {
  it('parses area and task deep links, with or without the leading hash', () => {
    expect(parseRoute('#/a/are1')).toEqual<Selection>({ kind: 'area', id: 'are1' });
    expect(parseRoute('/a/are1')).toEqual<Selection>({ kind: 'area', id: 'are1' });
    expect(parseRoute('#/t/task1')).toEqual<Selection>({ kind: 'task', id: 'task1' });
  });

  it('parses the fixed routes', () => {
    expect(parseRoute('#/today')).toEqual<Selection>({ kind: 'today' });
    expect(parseRoute('#/week')).toEqual<Selection>({ kind: 'week' });
    expect(parseRoute('#/inbox')).toEqual<Selection>({ kind: 'inbox' });
    expect(parseRoute('#/sync-log')).toEqual<Selection>({ kind: 'sync-log' });
  });

  it('collapses legacy project / note / tag deep links to home', () => {
    expect(parseRoute('#/p/proj1')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/p/proj1/notes')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/n/some-slug')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/g/work')).toEqual<Selection>({ kind: 'home' });
  });

  it('returns a home selection for empty / unknown hashes', () => {
    expect(parseRoute('')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/unknown/x')).toEqual<Selection>({ kind: 'home' });
    expect(parseRoute('#/a/')).toEqual<Selection>({ kind: 'home' });
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
    const cases: readonly [Selection, Selection, boolean][] = [
      [{ kind: 'home' }, { kind: 'home' }, true],
      [{ kind: 'inbox' }, { kind: 'inbox' }, true],
      [{ kind: 'inbox' }, { kind: 'home' }, false],
      [{ kind: 'today' }, { kind: 'today' }, true],
      [{ kind: 'today' }, { kind: 'week' }, false],
      [{ kind: 'week' }, { kind: 'week' }, true],
      [{ kind: 'week' }, { kind: 'inbox' }, false],
      [{ kind: 'sync-log' }, { kind: 'sync-log' }, true],
      [{ kind: 'sync-log' }, { kind: 'home' }, false],
      [{ kind: 'area', id: 'a1' }, { kind: 'area', id: 'a1' }, true],
      [{ kind: 'area', id: 'a1' }, { kind: 'area', id: 'a2' }, false],
      [{ kind: 'area', id: 'a1' }, { kind: 'home' }, false],
      [{ kind: 'task', id: 't1' }, { kind: 'task', id: 't1' }, true],
      [{ kind: 'task', id: 't1' }, { kind: 'task', id: 't2' }, false],
      [{ kind: 'task', id: 't1' }, { kind: 'area', id: 't1' }, false],
    ];
    for (const [a, b, expected] of cases) {
      expect(routeEquals(a, b), `${formatRoute(a)} vs ${formatRoute(b)}`).toBe(expected);
    }
  });
});
