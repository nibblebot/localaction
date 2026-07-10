export type Selection =
  | { kind: 'home' }
  | { kind: 'domain'; id: string }
  | { kind: 'project'; id: string };

export const HOME: Selection = { kind: 'home' };

/**
 * Recognises `#/d/<id>` (domain) and `#/p/<id>` (project) deep links.
 * Anything else — including legacy task / note / tag shapes — collapses
 * to `home` so stale links fall back to the welcome screen.
 */
export function parseRoute(raw: string): Selection {
  if (!raw) return HOME;
  const hash = raw.startsWith('#') ? raw : raw.startsWith('/') ? `#${raw}` : `#/${raw}`;
  let m = hash.match(/^#\/d\/([^/?#]+)$/);
  if (m && m[1]) return { kind: 'domain', id: decodeURIComponent(m[1]) };
  m = hash.match(/^#\/p\/([^/?#]+)$/);
  if (m && m[1]) return { kind: 'project', id: decodeURIComponent(m[1]) };
  return HOME;
}

export function formatRoute(sel: Selection): string {
  if (sel.kind === 'home') return '#/';
  if (sel.kind === 'domain') return `#/d/${encodeURIComponent(sel.id)}`;
  return `#/p/${encodeURIComponent(sel.id)}`;
}

export function routeEquals(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'home' && b.kind === 'home') return true;
  if (a.kind === 'domain' && b.kind === 'domain') return a.id === b.id;
  if (a.kind === 'project' && b.kind === 'project') return a.id === b.id;
  return false;
}
