export type Selection =
  | { kind: 'home' }
  | { kind: 'domain'; id: string }
  | { kind: 'project'; id: string }
  | { kind: 'task'; id: string }
  | { kind: 'note'; slug: string }
  | { kind: 'tag'; value: string };

const PREFIXES = {
  d: 'domain',
  p: 'project',
  t: 'task',
  n: 'note',
  g: 'tag',
} as const;

type Prefix = keyof typeof PREFIXES;

const HOME: Selection = { kind: 'home' };

export function parseRoute(raw: string): Selection {
  const hash = raw.startsWith('#') ? raw : raw.startsWith('/') ? `#${raw}` : `#/${raw}`;
  const match = hash.match(/^#\/([dptng])\/(.+)$/);
  if (!match) return HOME;
  const [, prefix, rawId] = match;
  const kind = PREFIXES[prefix as Prefix];
  if (!kind || !rawId) return HOME;
  const id = decodeURIComponent(rawId);
  if (kind === 'note') return { kind: 'note', slug: id };
  if (kind === 'tag') return { kind: 'tag', value: id };
  return { kind, id };
}

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
    case 'tag':
      return `#/g/${encodeURIComponent(sel.value)}`;
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
    case 'tag':
      return a.value === (b as { value: string }).value;
  }
}
