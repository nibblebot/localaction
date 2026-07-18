export type Selection =
  | { kind: 'home' }
  | { kind: 'inbox' }
  | { kind: 'area'; id: string }
  | { kind: 'project'; id: string };

export const HOME: Selection = { kind: 'home' };
export const INBOX: Selection = { kind: 'inbox' };

/**
 * Recognises `#/inbox` (Inbox), `#/a/<id>` (area), and `#/p/<id>`
 * (project) deep links. Anything else — including legacy task / note /
 * tag shapes — collapses to `home` so stale links fall back to the
 * welcome screen.
 */
export function parseRoute(raw: string): Selection {
  if (!raw) return HOME;
  const hash = raw.startsWith('#') ? raw : raw.startsWith('/') ? `#${raw}` : `#/${raw}`;
  if (hash === '#/' || hash === '#') return HOME;
  if (hash === '#/inbox') return INBOX;
  let m = hash.match(/^#\/a\/([^/?#]+)$/);
  if (m && m[1]) return { kind: 'area', id: decodeURIComponent(m[1]) };
  m = hash.match(/^#\/p\/([^/?#]+)$/);
  if (m && m[1]) return { kind: 'project', id: decodeURIComponent(m[1]) };
  return HOME;
}

export function formatRoute(sel: Selection): string {
  if (sel.kind === 'home') return '#/';
  if (sel.kind === 'inbox') return '#/inbox';
  if (sel.kind === 'area') return `#/a/${encodeURIComponent(sel.id)}`;
  return `#/p/${encodeURIComponent(sel.id)}`;
}

export function routeEquals(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'home' && b.kind === 'home') return true;
  if (a.kind === 'inbox' && b.kind === 'inbox') return true;
  if (a.kind === 'area' && b.kind === 'area') return a.id === b.id;
  return a.kind === 'project' && b.kind === 'project' && a.id === b.id;
}
