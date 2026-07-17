import { useMemo } from 'react';
import { initials } from '../../data/persons.ts';

export interface PersonAvatarProps {
  name: string;
  color: string;
  small?: boolean;
  title?: string;
  className?: string;
}

/**
 * Initials + color-filled disc. Used for rows (small) and headers
 * (default size). The avatar's `title` defaults to the person name
 * so a hover surfaces it (spec § 7.3).
 */
export default function PersonAvatar({
  name,
  color,
  small,
  title,
  className,
}: PersonAvatarProps): React.JSX.Element {
  const classes = ['person-avatar'];
  if (small) classes.push('person-avatar-sm');
  if (className) classes.push(className);
  const fg = useMemo(() => textOn(color), [color]);
  return (
    <span
      className={classes.join(' ')}
      style={{ background: color, color: fg }}
      title={(title ?? name) || '?'}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

function textOn(hex: string): string {
  // Standard YIQ luminance for a hex color.
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return '#1c1c1c';
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#1c1c1c' : '#ffffff';
}
