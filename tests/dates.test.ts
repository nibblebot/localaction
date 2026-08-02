import { describe, expect, it } from 'bun:test';
import { monthDayShort, weekdayWithDate } from '../src/components/shared/dates.ts';

const fmt = (year: number, month: number, day: number): string =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(year, month, day),
  );

describe('monthDayShort', () => {
  it('formats a local-date ISO string as a short month + day label', () => {
    expect(monthDayShort('2026-08-02')).toBe(fmt(2026, 7, 2));
  });

  it('formats a single-digit day without padding', () => {
    expect(monthDayShort('2026-01-05')).toBe(fmt(2026, 0, 5));
  });
});

describe('weekdayWithDate', () => {
  it('joins the short weekday and the month/day label with a comma', () => {
    // 2026-08-02 is a Sunday.
    expect(weekdayWithDate('2026-08-02')).toBe(`Sun, ${fmt(2026, 7, 2)}`);
  });

  it('uses the monthDayShort suffix for single-digit days', () => {
    // 2026-07-20 is a Monday.
    expect(weekdayWithDate('2026-07-20')).toBe(`Mon, ${fmt(2026, 6, 20)}`);
  });
});
