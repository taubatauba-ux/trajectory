import { describe, it, expect } from 'vitest';
import { computeConsecutiveDayStreak } from './streaks';

describe('computeConsecutiveDayStreak', () => {
  it('counts backward from today when today is in the set', () => {
    const dates = new Set(['2026-07-12', '2026-07-13', '2026-07-14']);
    expect(computeConsecutiveDayStreak(dates, '2026-07-14')).toBe(3);
  });

  it('does not zero out the streak just because today is missing', () => {
    const dates = new Set(['2026-07-12', '2026-07-13']); // not '2026-07-14'
    expect(computeConsecutiveDayStreak(dates, '2026-07-14')).toBe(2);
  });

  it('stops at the first real gap', () => {
    const dates = new Set(['2026-07-10', '2026-07-13', '2026-07-14']); // gap at 11-12
    expect(computeConsecutiveDayStreak(dates, '2026-07-14')).toBe(2);
  });

  it('is zero when neither today nor yesterday is present', () => {
    expect(computeConsecutiveDayStreak(new Set(['2026-06-01']), '2026-07-14')).toBe(0);
  });

  it('is zero for an empty set', () => {
    expect(computeConsecutiveDayStreak(new Set(), '2026-07-14')).toBe(0);
  });
});
