import { describe, expect, it } from 'bun:test';
import { renderMarkdown } from '../../src/markdown/render.ts';

describe('renderMarkdown', () => {
  it('renders basic markdown to HTML', () => {
    const html = renderMarkdown('# Hello\n\nworld');
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('<p>world</p>');
  });

  it('leaves double-bracket text literal instead of linking it', () => {
    const inline = renderMarkdown('See [[Family]]');
    expect(inline).toContain('[[Family]]');
    expect(inline).not.toContain('<a ');

    const code = renderMarkdown('`[[Family]]`');
    expect(code).toContain('<code>[[Family]]</code>');
  });
});
