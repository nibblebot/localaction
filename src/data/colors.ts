/**
 * Stable palette of area dot colors. Hex values are the design-system
 * accent shades the sidebar renders for an area's marker. Adding a color
 * here automatically makes it selectable from the AreaEditor.
 */
export const AREA_COLORS = [
  { id: 'purple', label: 'Purple', hex: '#7c5cff' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'green', label: 'Green', hex: '#22a06b' },
  { id: 'pink', label: 'Pink', hex: '#ec4899' },
  { id: 'amber', label: 'Amber', hex: '#f59e0b' },
  { id: 'gray', label: 'Gray', hex: '#9aa3ad' },
] as const;

export type AreaColorId = (typeof AREA_COLORS)[number]['id'];

const COLOR_BY_ID: Record<AreaColorId, string> = Object.fromEntries(
  AREA_COLORS.map((c) => [c.id, c.hex]),
) as Record<AreaColorId, string>;

const COLOR_IDS: ReadonlySet<string> = new Set(AREA_COLORS.map((c) => c.id));

export function isAreaColorId(value: unknown): value is AreaColorId {
  return typeof value === 'string' && COLOR_IDS.has(value);
}

export function areaColorHex(id: string | null | undefined): string {
  return isAreaColorId(id) ? COLOR_BY_ID[id] : COLOR_BY_ID.gray;
}
