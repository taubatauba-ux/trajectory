import { describe, it, expect } from 'vitest';
import { completedDatesForHabit, computeHabitStreak, computeCompletionStats } from './habitStats';
import type { HabitEntry } from '../../types';

function entry(habitId: string, date: string, completed: boolean): HabitEntry {
  return { id: `${habitId}-${date}`, habitId, date, completed };
}

describe('completedDatesForHabit', () => {
  it('includes only this habit\'s completed:true entries', () => {
    const entries = [
      entry('water', '2026-07-01', true),
      entry('water', '2026-07-02', false), // explicitly not done — excluded
      entry('sleep', '2026-07-01', true), // different habit — excluded
    ];
    expect(completedDatesForHabit(entries, 'water')).toEqual(new Set(['2026-07-01']));
  });
});

describe('computeHabitStreak', () => {
  it('counts consecutive completed days for just that habit', () => {
    const entries = [
      entry('water', '2026-07-13', true),
      entry('water', '2026-07-14', true),
      entry('sleep', '2026-07-13', false), // unrelated habit shouldn't affect this
    ];
    expect(computeHabitStreak(entries, 'water', '2026-07-14')).toBe(2);
  });

  it('is broken by an explicit completed:false, not just a missing entry', () => {
    const entries = [
      entry('water', '2026-07-12', true),
      entry('water', '2026-07-13', false),
      entry('water', '2026-07-14', true),
    ];
    expect(computeHabitStreak(entries, 'water', '2026-07-14')).toBe(1);
  });
});

describe('computeCompletionStats', () => {
  it('counts completions within the trailing window only', () => {
    const entries = [
      entry('water', '2026-07-14', true),
      entry('water', '2026-07-10', true),
      entry('water', '2026-06-01', true), // outside a 7-day window
    ];
    const stats = computeCompletionStats(entries, 'water', 7, '2026-07-14');
    expect(stats).toEqual({ completed: 2, windowDays: 7 });
  });

  it('is honest (not artificially scoped) about a habit with no history yet', () => {
    const stats = computeCompletionStats([], 'brand-new-habit', 7, '2026-07-14');
    expect(stats).toEqual({ completed: 0, windowDays: 7 });
  });
});
