export interface WikiLinkMatch {
  title: string;
  start: number;
  end: number;
}

const WIKI_LINK_RE = /\[\[(.+?)\]\]/g;

function maskCode(body: string): string {
  let out = body;
  out = out.replace(/`[^`\n]*`/g, (m) => '`' + ' '.repeat(Math.max(0, m.length - 2)) + '`');
  out = out.replace(/```[\s\S]*?```/g, (m) => '\n'.repeat((m.match(/\n/g)?.length ?? 0)));
  return out;
}

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