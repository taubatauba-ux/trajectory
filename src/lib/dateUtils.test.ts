import { describe, it, expect } from 'vitest';
import { todayISO, isSameDate, isTodayOrPast, formatLogTime, formatDayLabel, formatDatasetDate } from './dateUtils';

describe('todayISO', () => {
  it('formats a given instant as YYYY-MM-DD', () => {
    expect(todayISO(new Date('2026-07-14T09:30:00Z'))).toBe('2026-07-14');
  });
});

describe('isSameDate', () => {
  it('treats a bare date and a full timestamp on the same day as equal', () => {
    expect(isSameDate('2026-07-14', '2026-07-14T21:59:00.000Z')).toBe(true);
  });
  it('is false across a day boundary', () => {
    expect(isSameDate('2026-07-14', '2026-07-15T00:00:00.000Z')).toBe(false);
  });
});

describe('isTodayOrPast', () => {
  const now = new Date('2026-07-14T12:00:00Z');
  it('is true for today', () => {
    expect(isTodayOrPast('2026-07-14', now)).toBe(true);
  });
  it('is true for a past date', () => {
    expect(isTodayOrPast('2026-07-01', now)).toBe(true);
  });
  it('is false for a future date — this is the §9.6 check-in banner condition', () => {
    expect(isTodayOrPast('2026-07-15', now)).toBe(false);
  });
});

describe('formatLogTime', () => {
  it('formats morning times with AM', () => {
    expect(formatLogTime('2026-07-14T09:05:00')).toBe('9:05 AM');
  });
  it('formats afternoon times with PM using 12-hour wraparound', () => {
    expect(formatLogTime('2026-07-14T13:45:00')).toBe('1:45 PM');
  });
  it('formats midnight as 12 AM, not 0 AM', () => {
    expect(formatLogTime('2026-07-14T00:00:00')).toBe('12:00 AM');
  });
  it('formats noon as 12 PM, not 0 PM', () => {
    expect(formatLogTime('2026-07-14T12:00:00')).toBe('12:00 PM');
  });
});

describe('formatDayLabel', () => {
  it('renders a weekday + day-of-month label', () => {
    // 2026-07-14 is a Tuesday.
    expect(formatDayLabel('2026-07-14')).toBe('Tue 14');
  });
});

describe('formatDatasetDate', () => {
  it('formats a bare YYYY-MM-DD date', () => {
    expect(formatDatasetDate('2026-06-01')).toBe('Jun 1, 2026');
  });

  it('formats a full ISO timestamp without doubling up the time component', () => {
    expect(formatDatasetDate('2026-06-01T14:30:00+00:00')).toBe('Jun 1, 2026');
  });

  it('falls back to the raw string for something unparseable, rather than "Invalid Date"', () => {
    expect(formatDatasetDate('not-a-date')).toBe('not-a-date');
  });
});
