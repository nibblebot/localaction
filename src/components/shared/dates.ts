/**
 * Date-only helpers shared by due-date UI and date-driven selectors.
 * All functions work on LOCAL calendar dates (`YYYY-MM-DD`) — never
 * `Date#toISOString`, which is UTC and lands a day off near midnight.
 */

export function toIso(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Today's date as a local-date ISO string (`YYYY-MM-DD`). */
export function todayIso(): string {
  const now = new Date();
  return toIso(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Local-date comparison helper: parse an ISO `YYYY-MM-DD` into parts. */
export function partsOf(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return { year: NaN, month: NaN, day: NaN };
  return { year: y, month: m - 1, day: d };
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Short weekday name (e.g. "Mon"), or undefined for an invalid local date. */
export function weekdayShort(iso: string): string | undefined {
  const { year, month, day } = partsOf(iso);
  return WEEKDAY_SHORT[new Date(year, month, day).getDay()];
}

/**
 * Month + day-of-month label (e.g. "Aug 2") for a local-date ISO
 * string, locale-formatted via `Intl.DateTimeFormat`.
 */
export function monthDayShort(iso: string): string {
  const { year, month, day } = partsOf(iso);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(year, month, day),
  );
}

/**
 * Weekday + month/day label (e.g. "Mon, Jul 20") for a local-date ISO
 * string. Lets a row carry its calendar day inside any cross-day view.
 */
export function weekdayWithDate(iso: string): string {
  return `${weekdayShort(iso)}, ${monthDayShort(iso)}`;
}

/**
 * Current local Monday-Sunday week's bounds as `YYYY-MM-DD` strings,
 * normalised off `Date.prototype.getDay()` (0 = Sunday).
 */
export function weekBoundsIso(now: Date = new Date()): { from: string; to: string } {
  const offset = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return {
    from: toIso(monday.getFullYear(), monday.getMonth(), monday.getDate()),
    to: toIso(sunday.getFullYear(), sunday.getMonth(), sunday.getDate()),
  };
}

/**
 * Header label for a date range. Same month collapses to `Jul 20 – 26`,
 * month boundary expands to `Jul 27 – Aug 2`, year boundary to
 * `Dec 28, 2025 – Jan 3, 2026`.
 */
export function rangeLabel(from: string, to: string): string {
  const a = partsOf(from);
  const b = partsOf(to);
  if (a.year === b.year && a.month === b.month) {
    const fmt = new Intl.DateTimeFormat(undefined, { month: 'short' });
    return `${fmt.format(new Date(a.year, a.month, a.day))} ${a.day} – ${b.day}`;
  }
  if (a.year === b.year) {
    const fmt = new Intl.DateTimeFormat(undefined, { month: 'short' });
    return `${fmt.format(new Date(a.year, a.month, a.day))} ${a.day} – ${fmt.format(new Date(b.year, b.month, b.day))} ${b.day}`;
  }
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${fmt.format(new Date(a.year, a.month, a.day))} – ${fmt.format(new Date(b.year, b.month, b.day))}`;
}
