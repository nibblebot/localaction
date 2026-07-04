/**
 * Wiki-link extraction and resolution for Note bodies.
 *
 * A wiki-link is `[[Note Title]]` (or `[[note-slug]]`). This module is the
 * single source of truth for *finding* those links in a markdown string;
 * the renderer (issue 08) consumes `findWikiLinkMatches` to turn them into
 * navigable anchors, and the note-slug lock (issue 07) consumes
 * `extractWikiLinks` to decide whether a rename may re-derive the slug.
 *
 * Code spans (` `[[x]]` `) and fenced code blocks are ignored so example
 * markup in a note doesn't masquerade as a real link.
 */

export interface WikiLinkMatch {
  /** The inner text of the `[[…]]`, trimmed. */
  title: string;
  /** Character offset of the opening `[[` in the source string. */
  start: number;
  /** Character offset one past the closing `]]`. */
  end: number;
}

const WIKI_LINK_RE = /\[\[(.+?)\]\]/g;

/**
 * Strip fenced code blocks and inline code spans from `body`, returning the
 * text with those regions blanked (length preserved) so link offsets in the
 * returned string still line up with the original for offset-based renderers.
 */
function maskCode(body: string): string {
  let out = body;
  // Inline code spans: `...`. Blank the contents but keep backticks so
  // widths are stable.
  out = out.replace(/`[^`\n]*`/g, (m) => '`' + ' '.repeat(Math.max(0, m.length - 2)) + '`');
  // Fenced blocks: ``` ... ```. Blank line contents.
  out = out.replace(/```[\s\S]*?```/g, (m) => '\n'.repeat((m.match(/\n/g)?.length ?? 0)));
  return out;
}

/** All wiki-link titles found in `body`, in order of appearance, de-duped. */
export function extractWikiLinks(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of findWikiLinkMatches(body)) {
    if (!seen.has(match.title)) {
      seen.add(match.title);
      out.push(match.title);
    }
  }
  return out;
}

/** Structured matches with offsets, for the renderer. */
export function findWikiLinkMatches(body: string): WikiLinkMatch[] {
  const masked = maskCode(body);
  const out: WikiLinkMatch[] = [];
  for (const match of masked.matchAll(WIKI_LINK_RE)) {
    const start = match.index ?? 0;
    const inner = match[1];
    out.push({
      title: inner.trim(),
      start,
      end: start + match[0].length,
    });
  }
  return out;
}