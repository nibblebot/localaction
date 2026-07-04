import { describe, expect, it } from 'vitest';
import {
  buildNoteIndex,
  resolveWikiLink,
  renderMarkdown,
} from '../../src/markdown/render.ts';
import type { NoteIndexEntry } from '../../src/markdown/render.ts';

const NOTES: NoteIndexEntry[] = [
  { id: 'n1', slug: 'family', title: 'Family' },
  { id: 'n2', slug: 'meeting-notes', title: 'Meeting Notes' },
];

describe('resolveWikiLink', () => {
  const index = buildNoteIndex(NOTES);

  it('resolves by exact title (case-insensitive)', () => {
    expect(resolveWikiLink('family', index)).toMatchObject({ slug: 'family', missing: false });
    expect(resolveWikiLink('FAMILY', index)).toMatchObject({ slug: 'family', missing: false });
  });

  it('resolves by slug when the title is itself a slug', () => {
    expect(resolveWikiLink('meeting-notes', index)).toMatchObject({
      slug: 'meeting-notes',
      missing: false,
    });
  });

  it('flags an unknown target as missing', () => {
    expect(resolveWikiLink('Nope', index).missing).toBe(true);
  });

  it('flags as missing when no index is supplied', () => {
    expect(resolveWikiLink('Family', undefined).missing).toBe(true);
  });
});

describe('renderMarkdown', () => {
  const index = buildNoteIndex(NOTES);

  it('renders basic markdown to HTML', () => {
    const html = renderMarkdown('# Hello\n\nworld', index);
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('<p>world</p>');
  });

  it('renders a resolved wiki-link as an anchor to the note route', () => {
    const html = renderMarkdown('See [[Family]]', index);
    expect(html).toContain('href="#/n/family"');
    expect(html).toContain('>Family</a>');
    expect(html).not.toContain('wiki-link-missing');
  });

  it('renders a missing wiki-link with the missing class', () => {
    const html = renderMarkdown('See [[Ghost]]', index);
    expect(html).toContain('wiki-link-missing');
    expect(html).toContain('Ghost');
  });

  it('does not turn code spans into wiki-links', () => {
    const html = renderMarkdown('`[[Family]]`', index);
    expect(html).not.toContain('href="#/n/family"');
  });
});