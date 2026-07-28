import { describe, it, expect } from 'vitest';
import {
  reconstructHistoricalTargets,
  computeLoggedDaysStreak,
  computeMacroAccuracy,
  computeAdherenceForWindow,
} from './adherence';
import { splitMacros } from '../../engine/targetLimiter';
import type { DailyReplayPoint } from '../../engine/callEngine';
import type { Macros } from '../../types';

function replayPoint(overrides: Partial<DailyReplayPoint> & { date: string }): DailyReplayPoint {
  return {
    state: { W: 70, TDEE: 2400 },
    cov: [[0.01, 0], [0, 9]],
    didUpdate: true,
    outlierFlagged: false,
    displayedTargetKcal: 2000,
    ...overrides,
  };
}

describe('reconstructHistoricalTargets', () => {
  it('applies splitMacros per day using that day\'s own target kcal and weight', () => {
    const replay = [
      replayPoint({ date: '2026-07-01', displayedTargetKcal: 2000, state: { W: 70, TDEE: 2400 } }),
      replayPoint({ date: '2026-07-02', displayedTargetKcal: 1900, state: { W: 69.5, TDEE: 2380 } }),
    ];
    const targets = reconstructHistoricalTargets(replay);
    expect(targets.get('2026-07-01')).toEqual(splitMacros(2000, 70));
    expect(targets.get('2026-07-02')).toEqual(splitMacros(1900, 69.5));
    // Different days genuinely differ (not the same object reused) since target kcal
    // and weight both moved.
    expect(targets.get('2026-07-01')).not.toEqual(targets.get('2026-07-02'));
  });

  it('returns an empty map for an empty replay', () => {
    expect(reconstructHistoricalTargets([]).size).toBe(0);
  });
});

describe('computeLoggedDaysStreak', () => {
  // Full algorithm coverage (gap handling, today-not-required, empty set, etc.) lives
  // in _shared/streaks.test.ts, since this is now a thin re-export of that shared
  // implementation (see adherence.ts). This just confirms the delegation is wired up.
  it('delegates to the shared consecutive-day-streak algorithm', () => {
    const logged = new Set(['2026-07-13', '2026-07-14']);
    expect(computeLoggedDaysStreak(logged, '2026-07-14')).toBe(2);
  });
});

describe('computeMacroAccuracy', () => {
  it('is 100 for an exact match', () => {
    const m: Macros = { kcal: 2000, proteinG: 140, fatG: 60, carbG: 200 };
    expect(computeMacroAccuracy(m, m)).toEqual({ kcal: 100, proteinG: 100, fatG: 100, carbG: 100 });
  });

  it('penalizes over- and under-shooting symmetrically', () => {
    const target: Macros = { kcal: 2000, proteinG: 140, fatG: 60, carbG: 200 };
    const over = computeMacroAccuracy({ ...target, kcal: 2200 }, target); // +10%
    const under = computeMacroAccuracy({ ...target, kcal: 1800 }, target); // -10%
    expect(over.kcal).toBe(90);
    expect(under.kcal).toBe(90);
  });

  it('clamps at 0 rather than going negative when wildly off target', () => {
    const target: Macros = { kcal: 2000, proteinG: 140, fatG: 60, carbG: 200 };
    const wildlyOff = computeMacroAccuracy({ ...target, kcal: 6000 }, target);
    expect(wildlyOff.kcal).toBe(0);
  });

  it('treats a zero target as 100% only when actual is also zero', () => {
    const target: Macros = { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 };
    expect(computeMacroAccuracy({ kcal: 0, proteinG: 0, fatG: 0, carbG: 0 }, target).kcal).toBe(100);
    expect(computeMacroAccuracy({ kcal: 50, proteinG: 0, fatG: 0, carbG: 0 }, target).kcal).toBe(0);
  });
});

describe('computeAdherenceForWindow', () => {
  const target: Macros = { kcal: 2000, proteinG: 140, fatG: 60, carbG: 200 };
  const exact: Macros = { ...target };

  it('averages only over logged days within the window, ignoring days outside it', () => {
    const dailyTotals = new Map<string, Macros>([
      ['2026-07-13', exact],
      ['2026-07-14', exact],
      ['2026-06-01', { ...target, kcal: 500 }], // way outside a 7-day window — must be excluded
    ]);
    const targets = new Map<string, Macros>([
      ['2026-07-13', target],
      ['2026-07-14', target],
      ['2026-06-01', target],
    ]);
    const summary = computeAdherenceForWindow(7, '2026-07-14', dailyTotals, targets);
    expect(summary.loggedDaysInWindow).toBe(2);
    expect(summary.avgAccuracy).toEqual({ kcal: 100, proteinG: 100, fatG: 100, carbG: 100 });
  });

  it('excludes days present in totals but missing a reconstructed target (or vice versa)', () => {
    const dailyTotals = new Map<string, Macros>([['2026-07-14', exact]]);
    const targets = new Map<string, Macros>(); // no target reconstructed for that day
    const summary = computeAdherenceForWindow(7, '2026-07-14', dailyTotals, targets);
    expect(summary.loggedDaysInWindow).toBe(0);
    expect(summary.avgAccuracy).toBeNull();
  });

  it('returns null avgAccuracy (not zero) when nothing was logged in the window', () => {
    const summary = computeAdherenceForWindow(7, '2026-07-14', new Map(), new Map());
    expect(summary.avgAccuracy).toBeNull();
    expect(summary.loggedDaysInWindow).toBe(0);
  });

  it('a 30-day window includes a day a 7-day window would exclude', () => {
    const date = '2026-06-20'; // 24 days before 2026-07-14
    const dailyTotals = new Map<string, Macros>([[date, exact]]);
    const targets = new Map<string, Macros>([[date, target]]);
    expect(computeAdherenceForWindow(7, '2026-07-14', dailyTotals, targets).loggedDaysInWindow).toBe(0);
    expect(computeAdherenceForWindow(30, '2026-07-14', dailyTotals, targets).loggedDaysInWindow).toBe(1);
  });
});
