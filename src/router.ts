/**
 * Hash-based router for deep links to entities.
 *
 * URL shapes (issue 11):
 *   `#/d/<domain-id>`     — Domain
 *   `#/p/<project-id>`    — Project
 *   `#/t/<task-id>`       — Task
 *   `#/n/<note-slug>`     — Note (by slug, the stable wiki-link target)
 *   `#/`                  — Home (no selection)
 *
 * Parsing and formatting are pure so they can be unit-tested in isolation;
 * the React glue (`useRoute` / `navigate`) lives in the components and just
 * shuttles between `window.location.hash` and these functions. Invalid or
 * truncated hashes fall back to `home` so the app always lands somewhere.
 */

export type Selection =
  | { kind: 'home' }
  | { kind: 'domain'; id: string }
  | { kind: 'project'; id: string }
  | { kind: 'task'; id: string }
  | { kind: 'note'; slug: string };

const PREFIXES = {
  d: 'domain',
  p: 'project',
  t: 'task',
  n: 'note',
} as const;

type Prefix = keyof typeof PREFIXES;

const HOME: Selection = { kind: 'home' };

/** Parse a hash (or bare path) into a Selection. Unknown → home. */
export function parseRoute(raw: string): Selection {
  const hash = raw.startsWith('#') ? raw : raw.startsWith('/') ? `#${raw}` : `#/${raw}`;
  const match = hash.match(/^#\/([dptn])\/(.+)$/);
  if (!match) return HOME;
  const [, prefix, id] = match;
  const kind = PREFIXES[prefix as Prefix];
  if (!kind || !id) return HOME;
  if (kind === 'note') return { kind: 'note', slug: decodeURIComponent(id) };
  return { kind, id };
}

/** Format a Selection back into a hash string. */
export function formatRoute(sel: Selection): string {
  switch (sel.kind) {
    case 'home':
      return '#/';
    case 'domain':
      return `#/d/${sel.id}`;
    case 'project':
      return `#/p/${sel.id}`;
    case 'task':
      return `#/t/${sel.id}`;
    case 'note':
      return `#/n/${encodeURIComponent(sel.slug)}`;
  }
}

export function routeEquals(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'home':
      return true;
    case 'domain':
    case 'project':
    case 'task':
      return a.id === (b as { id: string }).id;
    case 'note':
      return a.slug === (b as { slug: string }).slug;
  }
}