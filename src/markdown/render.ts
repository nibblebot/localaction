import MarkdownIt from 'markdown-it';
import type { RenderRule } from 'markdown-it/lib/renderer.mjs';
import { slugify } from '../data/slug.ts';

export interface NoteIndexEntry {
  id: string;
  slug: string;
  title: string;
}

export interface NoteIndex {
  bySlug: Map<string, NoteIndexEntry>;
  byTitleLower: Map<string, NoteIndexEntry>;
}

export function buildNoteIndex(notes: Iterable<NoteIndexEntry>): NoteIndex {
  const bySlug = new Map<string, NoteIndexEntry>();
  const byTitleLower = new Map<string, NoteIndexEntry>();
  for (const n of notes) {
    bySlug.set(n.slug, n);
    byTitleLower.set(n.title.toLowerCase(), n);
  }
  return { bySlug, byTitleLower };
}

export interface ResolvedLink {
  slug: string;
  title: string;
  missing: boolean;
}

export function resolveWikiLink(title: string, index?: NoteIndex): ResolvedLink {
  const trimmed = title.trim();
  const byTitle = index?.byTitleLower.get(trimmed.toLowerCase());
  if (byTitle) {
    return { slug: byTitle.slug, title: byTitle.title, missing: false };
  }
  const bySlug = index?.bySlug.get(trimmed);
  if (bySlug) {
    return { slug: bySlug.slug, title: bySlug.title, missing: false };
  }
  const slug = slugify(trimmed);
  return { slug: slug.length ? slug : 'untitled', title: trimmed, missing: true };
}

export interface RenderEnv {
  noteIndex?: NoteIndex;
}

const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

md.inline.ruler.before('emphasis', 'localaction_wikilink', (state, silent) => {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x5b /* [ */) return false;
  if (src.charCodeAt(start + 1) !== 0x5b /* [ */) return false;

  const end = src.indexOf(']]', start + 2);
  if (end === -1) return false;

  const inner = src.slice(start + 2, end).trim();
  if (inner.length === 0) return false;
  if (inner.includes('\n')) return false;

  if (!silent) {
    const token = state.push('wiki_link', '', 0);
    token.content = inner;
  }
  state.pos = end + 2;
  return true;
});

const renderWikiLink: RenderRule = (tokens, idx, _opts, env) => {
  const title = tokens[idx].content;
  const resolved = resolveWikiLink(title, (env as RenderEnv | undefined)?.noteIndex);
  const klass = resolved.missing ? 'wiki-link wiki-link-missing' : 'wiki-link';
  const href = `#/n/${resolved.slug}`;
  const label = escapeHtml(resolved.title);
  return `<a class="${klass}" href="${href}">${label}</a>`;
};

md.renderer.rules.wiki_link = renderWikiLink;

export function renderMarkdown(body: string, index?: NoteIndex): string {
  return md.render(body, { noteIndex: index } satisfies RenderEnv);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}