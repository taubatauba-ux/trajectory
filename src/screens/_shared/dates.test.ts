import { describe, it, expect } from 'vitest';
import {
  todayISO,
  toDateOnly,
  isValidDateOnly,
  addDaysISO,
  daysBetweenISO,
  enumerateDatesISO,
  weekdayIndex,
  formatDisplayDate,
  formatWeekdayAbbr,
  monthLabel,
  daysInMonth,
  getMonthGrid,
  addMonths,
} from './dates';

describe('todayISO / toDateOnly', () => {
  it('extracts the UTC calendar date, not the local one', () => {
    // 23:30 UTC on Jan 15 is still Jan 15 in UTC even if the sandbox's local zone
    // would call it Jan 16 — this is the exact behavior adaptiveTdeeEngine.ts relies on.
    expect(todayISO(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-15');
    expect(toDateOnly('2026-06-01T00:00:00.000Z')).toBe('2026-06-01');
    expect(toDateOnly('2026-06-01')).toBe('2026-06-01');
  });
});

describe('isValidDateOnly', () => {
  it('accepts well-formed real calendar dates', () => {
    expect(isValidDateOnly('2026-07-14')).toBe(true);
    expect(isValidDateOnly('2024-02-29')).toBe(true); // leap year
  });
  it('rejects malformed strings and calendar overflow', () => {
    expect(isValidDateOnly('2026-13-01')).toBe(false); // month 13
    expect(isValidDateOnly('2026-02-30')).toBe(false); // Feb has no 30th
    expect(isValidDateOnly('2025-02-29')).toBe(false); // not a leap year
    expect(isValidDateOnly('not-a-date')).toBe(false);
    expect(isValidDateOnly('2026-7-14')).toBe(false); // needs zero-padding
  });
});

describe('addDaysISO / daysBetweenISO', () => {
  it('adds and subtracts days, crossing month/year boundaries', () => {
    expect(addDaysISO('2026-07-14', 1)).toBe('2026-07-15');
    expect(addDaysISO('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysISO('2026-07-14', -14)).toBe('2026-06-30');
  });
  it('computes signed day differences', () => {
    expect(daysBetweenISO('2026-07-01', '2026-07-14')).toBe(13);
    expect(daysBetweenISO('2026-07-14', '2026-07-01')).toBe(-13);
    expect(daysBetweenISO('2026-07-14', '2026-07-14')).toBe(0);
  });
});

describe('enumerateDatesISO', () => {
  it('is inclusive of both endpoints', () => {
    expect(enumerateDatesISO('2026-07-01', '2026-07-04')).toEqual([
      '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04',
    ]);
  });
  it('returns a single date when start === end', () => {
    expect(enumerateDatesISO('2026-07-01', '2026-07-01')).toEqual(['2026-07-01']);
  });
  it('returns empty when end precedes start, rather than throwing', () => {
    expect(enumerateDatesISO('2026-07-04', '2026-07-01')).toEqual([]);
  });
});

describe('weekdayIndex / formatWeekdayAbbr', () => {
  it('matches known reference dates (2026-07-14 is a Tuesday)', () => {
    expect(weekdayIndex('2026-07-14')).toBe(2);
    expect(formatWeekdayAbbr('2026-07-14')).toBe('Tue');
    expect(weekdayIndex('2026-07-12')).toBe(0); // Sunday
    expect(formatWeekdayAbbr('2026-07-12')).toBe('Sun');
  });
});

describe('formatDisplayDate', () => {
  it('renders day-month, with year only when requested', () => {
    expect(formatDisplayDate('2026-07-14')).toBe('14 Jul');
    expect(formatDisplayDate('2026-07-14', true)).toBe('14 Jul 2026');
    expect(formatDisplayDate('2026-01-05')).toBe('5 Jan'); // no leading zero on the day
  });
});

describe('monthLabel / daysInMonth', () => {
  it('labels months and counts their days, including leap Februaries', () => {
    expect(monthLabel(2026, 6)).toBe('Jul 2026');
    expect(daysInMonth(2026, 1)).toBe(28); // Feb 2026, not a leap year
    expect(daysInMonth(2024, 1)).toBe(29); // Feb 2024, leap year
    expect(daysInMonth(2026, 0)).toBe(31); // Jan
    expect(daysInMonth(2026, 3)).toBe(30); // Apr
  });
});

describe('getMonthGrid', () => {
  it('produces a fixed 6×7 grid padded with nulls, in correct weekday columns', () => {
    // July 2026: 1st is a Wednesday → 3 leading blanks (Sun, Mon, Tue), 31 days.
    const grid = getMonthGrid(2026, 6);
    expect(grid).toHaveLength(6);
    grid.forEach((week) => expect(week).toHaveLength(7));

    expect(grid[0]![0]!.dateISO).toBeNull();
    expect(grid[0]![1]!.dateISO).toBeNull();
    expect(grid[0]![2]!.dateISO).toBeNull();
    expect(grid[0]![3]!.dateISO).toBe('2026-07-01'); // Wednesday column

    const allDates = grid.flat().map((c) => c.dateISO).filter((d): d is string => d !== null);
    expect(allDates).toHaveLength(31);
    expect(allDates[0]).toBe('2026-07-01');
    expect(allDates[allDates.length - 1]).toBe('2026-07-31');
  });

  it('handles a month that needs all 6 rows (31 days starting on Saturday)', () => {
    // Aug 2026 starts on a Saturday and has 31 days — a real 6-row case, not just padding.
    const grid = getMonthGrid(2026, 7);
    const allDates = grid.flat().map((c) => c.dateISO).filter((d): d is string => d !== null);
    expect(allDates).toHaveLength(31);
  });
});

describe('addMonths', () => {
  it('wraps forward and backward across year boundaries', () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, monthIndex0: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, monthIndex0: 11 });
    expect(addMonths(2026, 6, 3)).toEqual({ year: 2026, monthIndex0: 9 });
    expect(addMonths(2026, 6, -6)).toEqual({ year: 2026, monthIndex0: 0 });
  });
});
