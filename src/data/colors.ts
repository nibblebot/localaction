/**
 * Stable palette of domain dot colors. Hex values are the design-system
 * accent shades the sidebar renders for a domain's marker. Adding a color
 * here automatically makes it selectable from the DomainEditor.
 */
export const DOMAIN_COLORS = [
  { id: 'purple', label: 'Purple', hex: '#7c5cff' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'green', label: 'Green', hex: '#22a06b' },
  { id: 'pink', label: 'Pink', hex: '#ec4899' },
  { id: 'amber', label: 'Amber', hex: '#f59e0b' },
  { id: 'gray', label: 'Gray', hex: '#9aa3ad' },
] as const;

export type DomainColorId = (typeof DOMAIN_COLORS)[number]['id'];

const COLOR_BY_ID: Record<DomainColorId, string> = Object.fromEntries(
  DOMAIN_COLORS.map((c) => [c.id, c.hex]),
) as Record<DomainColorId, string>;

const COLOR_IDS: ReadonlySet<string> = new Set(DOMAIN_COLORS.map((c) => c.id));

export function isDomainColorId(value: unknown): value is DomainColorId {
  return typeof value === 'string' && COLOR_IDS.has(value);
}

export function domainColorHex(id: string | null | undefined): string {
  return isDomainColorId(id) ? COLOR_BY_ID[id] : COLOR_BY_ID.gray;
}
