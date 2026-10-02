export type Selection =
  | { kind: 'home' }
  | { kind: 'inbox' }
  | { kind: 'today' }
  | { kind: 'week' }
  | { kind: 'area'; id: string }
  | { kind: 'task'; id: string }
  | { kind: 'sync-log' };

export const HOME: Selection = { kind: 'home' };
export const INBOX: Selection = { kind: 'inbox' };
export const TODAY: Selection = { kind: 'today' };
export const WEEK: Selection = { kind: 'week' };
export const SYNC_LOG: Selection = { kind: 'sync-log' };

/**
 * Recognises `#/inbox` (Inbox), `#/today` (Today), `#/week` (Week),
 * `#/sync-log` (sync debug log), `#/a/<id>` (area), and `#/t/<id>`
 * (task detail) deep links. Anything else — including legacy
 * note / tag shapes — collapses to `home` so stale links fall back to
 * the welcome screen.
 */
export function parseRoute(raw: string): Selection {
  if (!raw) return HOME;
  const hash = raw.startsWith('#') ? raw : raw.startsWith('/') ? `#${raw}` : `#/${raw}`;
  if (hash === '#/' || hash === '#') return HOME;
  if (hash === '#/inbox') return INBOX;
  if (hash === '#/today') return TODAY;
  if (hash === '#/week') return WEEK;
  if (hash === '#/sync-log') return SYNC_LOG;
  let m = hash.match(/^#\/a\/([^/?#]+)$/);
  if (m && m[1]) return { kind: 'area', id: decodeURIComponent(m[1]) };
  m = hash.match(/^#\/t\/([^/?#]+)$/);
  if (m && m[1]) return { kind: 'task', id: decodeURIComponent(m[1]) };
  return HOME;
}

export function formatRoute(sel: Selection): string {
  if (sel.kind === 'home') return '#/';
  if (sel.kind === 'inbox') return '#/inbox';
  if (sel.kind === 'today') return '#/today';
  if (sel.kind === 'week') return '#/week';
  if (sel.kind === 'sync-log') return '#/sync-log';
  if (sel.kind === 'area') return `#/a/${encodeURIComponent(sel.id)}`;
  return `#/t/${encodeURIComponent(sel.id)}`;
}

export function routeEquals(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'home' && b.kind === 'home') return true;
  if (a.kind === 'inbox' && b.kind === 'inbox') return true;
  if (a.kind === 'today' && b.kind === 'today') return true;
  if (a.kind === 'week' && b.kind === 'week') return true;
  if (a.kind === 'sync-log' && b.kind === 'sync-log') return true;
  if (a.kind === 'area' && b.kind === 'area') return a.id === b.id;
  return a.kind === 'task' && b.kind === 'task' && a.id === b.id;
}
