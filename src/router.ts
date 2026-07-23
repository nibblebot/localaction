export type Selection =
  | { kind: 'home' }
  | { kind: 'inbox' }
  | { kind: 'today' }
  | { kind: 'week' }
  | { kind: 'area'; id: string }
  | { kind: 'project-notes'; id: string };

export const HOME: Selection = { kind: 'home' };
export const INBOX: Selection = { kind: 'inbox' };
export const TODAY: Selection = { kind: 'today' };
export const WEEK: Selection = { kind: 'week' };

/**
 * Recognises `#/inbox` (Inbox), `#/today` (Today), `#/week` (Week),
 * `#/a/<id>` (area), and
 * `#/p/<id>/notes` (project notes) deep links. Anything else —
 * including legacy task / note / tag shapes and the retired
 * `#/p/<id>` project-pane links — collapses to `home` so stale
 * links fall back to the welcome screen.
 */
export function parseRoute(raw: string): Selection {
  if (!raw) return HOME;
  const hash = raw.startsWith('#') ? raw : raw.startsWith('/') ? `#${raw}` : `#/${raw}`;
  if (hash === '#/' || hash === '#') return HOME;
  if (hash === '#/inbox') return INBOX;
  if (hash === '#/today') return TODAY;
  if (hash === '#/week') return WEEK;
  let m = hash.match(/^#\/a\/([^/?#]+)$/);
  if (m && m[1]) return { kind: 'area', id: decodeURIComponent(m[1]) };
  m = hash.match(/^#\/p\/([^/?#]+)\/notes$/);
  if (m && m[1]) return { kind: 'project-notes', id: decodeURIComponent(m[1]) };
  return HOME;
}

export function formatRoute(sel: Selection): string {
  if (sel.kind === 'home') return '#/';
  if (sel.kind === 'inbox') return '#/inbox';
  if (sel.kind === 'today') return '#/today';
  if (sel.kind === 'week') return '#/week';
  if (sel.kind === 'area') return `#/a/${encodeURIComponent(sel.id)}`;
  return `#/p/${encodeURIComponent(sel.id)}/notes`;
}

export function routeEquals(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'home' && b.kind === 'home') return true;
  if (a.kind === 'inbox' && b.kind === 'inbox') return true;
  if (a.kind === 'today' && b.kind === 'today') return true;
  if (a.kind === 'week' && b.kind === 'week') return true;
  if (a.kind === 'area' && b.kind === 'area') return a.id === b.id;
  return a.kind === 'project-notes' && b.kind === 'project-notes' && a.id === b.id;
}
