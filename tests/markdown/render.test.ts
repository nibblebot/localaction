import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../src/markdown/render.ts';

describe('renderMarkdown', () => {
  it('renders basic markdown to HTML', () => {
    const html = renderMarkdown('# Hello\n\nworld');
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('<p>world</p>');
  });

  it('does not turn double-bracket text into a link', () => {
    const html = renderMarkdown('See [[Family]]');
    expect(html).not.toContain('wiki-link');
    expect(html).toContain('[[Family]]');
  });

  it('does not turn code spans into links', () => {
    const html = renderMarkdown('`[[Family]]`');
    expect(html).not.toContain('wiki-link');
  });
});