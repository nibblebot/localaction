import { describe, expect, it } from 'vitest';
import { extractWikiLinks, findWikiLinkMatches } from '../../src/markdown/wikiLinks.ts';

describe('extractWikiLinks', () => {
  it('returns the inner titles of all [[...]] links', () => {
    expect(extractWikiLinks('See [[Family]] and [[Wife]]')).toEqual([
      'Family',
      'Wife',
    ]);
  });

  it('trims surrounding whitespace inside the brackets', () => {
    expect(extractWikiLinks('[[  spaced  ]]')).toEqual(['spaced']);
  });

  it('ignores single brackets and code-fenced spans', () => {
    expect(extractWikiLinks('not a [link] or `[[code]]` here')).toEqual([]);
  });

  it('ignores wiki-links inside fenced code blocks', () => {
    const body = [
      'Before [[kept]]',
      '',
      '```js',
      'const x = "[[ignored]]";',
      '```',
      '',
      'After [[also-kept]]',
    ].join('\n');
    expect(extractWikiLinks(body)).toEqual(['kept', 'also-kept']);
  });

  it('returns an empty array when there are no links', () => {
    expect(extractWikiLinks('plain text')).toEqual([]);
  });
});

describe('findWikiLinkMatches', () => {
  it('reports the offset and matched title for each link', () => {
    const matches = findWikiLinkMatches('x [[A]] y [[B]]');
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ title: 'A' });
    expect(matches[1]).toMatchObject({ title: 'B' });
    expect(matches[0].start).toBeLessThan(matches[1].start);
  });
});