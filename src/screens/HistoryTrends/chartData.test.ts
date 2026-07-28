import { describe, it, expect } from 'vitest';
import {
  buildWeightTrendSeries,
  buildRawWeighInSeries,
  buildExpenditureSeries,
  filterByRange,
} from './chartData';
import type { DailyReplayPoint } from '../../engine/callEngine';
import type { WeighIn } from '../../types';

function replayPoint(overrides: Partial<DailyReplayPoint> & { date: string }): DailyReplayPoint {
  return {
    state: { W: 70, TDEE: 2400 },
    cov: [[0.01, 0], [0, 100]], // sdTdee = sqrt(100) = 10
    didUpdate: true,
    outlierFlagged: false,
    displayedTargetKcal: 2000,
    ...overrides,
  };
}

describe('buildWeightTrendSeries', () => {
  it('emits one rounded-to-0.1kg point per replay day, including predict-only days', () => {
    const replay = [
      replayPoint({ date: '2026-07-01', state: { W: 70.04, TDEE: 2400 } }),
      replayPoint({ date: '2026-07-02', state: { W: 69.963, TDEE: 2395 }, didUpdate: false }),
    ];
    expect(buildWeightTrendSeries(replay)).toEqual([
      { date: '2026-07-01', trendWeightKg: 70 },
      { date: '2026-07-02', trendWeightKg: 70 },
    ]);
  });
});

describe('buildRawWeighInSeries', () => {
  it('includes only dates with an actual weigh-in, sorted ascending', () => {
    const replay = [
      replayPoint({ date: '2026-07-01' }),
      replayPoint({ date: '2026-07-02' }),
      replayPoint({ date: '2026-07-03' }),
    ];
    const weighIns: WeighIn[] = [
      { id: 'w2', date: '2026-07-03', weightKg: 69.5 },
      { id: 'w1', date: '2026-07-01', weightKg: 70.234 },
    ];
    const series = buildRawWeighInSeries(replay, weighIns);
    expect(series).toEqual([
      { date: '2026-07-01', rawWeightKg: 70.2, isOutlier: false },
      { date: '2026-07-03', rawWeightKg: 69.5, isOutlier: false },
    ]);
  });

  it('carries over outlierFlagged from the matching replay day, not recomputed here', () => {
    const replay = [replayPoint({ date: '2026-07-05', outlierFlagged: true })];
    const weighIns: WeighIn[] = [{ id: 'w1', date: '2026-07-05', weightKg: 68 }];
    expect(buildRawWeighInSeries(replay, weighIns)[0]!.isOutlier).toBe(true);
  });

  it('defaults isOutlier to false if a weigh-in date is somehow absent from the replay', () => {
    const weighIns: WeighIn[] = [{ id: 'w1', date: '2026-07-09', weightKg: 68 }];
    expect(buildRawWeighInSeries([], weighIns)[0]!.isOutlier).toBe(false);
  });
});

describe('buildExpenditureSeries', () => {
  it('computes tdee, and a lower/bandWidth pair whose sum reconstructs +1 SD', () => {
    const replay = [replayPoint({ date: '2026-07-01', state: { W: 70, TDEE: 2400 }, cov: [[0.01, 0], [0, 100]] })];
    const [point] = buildExpenditureSeries(replay);
    expect(point).toEqual({ date: '2026-07-01', tdee: 2400, lower: 2390, bandWidth: 20 });
    // lower + bandWidth must equal the upper bound (TDEE + SD) for the stacked-area
    // band trick to actually render the right visual range.
    expect(point!.lower + point!.bandWidth).toBe(2410);
  });
});

describe('filterByRange', () => {
  const points = [
    { date: '2026-05-01' },
    { date: '2026-06-01' },
    { date: '2026-06-20' },
    { date: '2026-07-01' },
    { date: '2026-07-14' },
  ];
  const anchor = '2026-07-14';

  it("'all' returns every point unchanged", () => {
    expect(filterByRange(points, 'all', anchor)).toEqual(points);
  });

  it('30 keeps only points within 30 days of the anchor (inclusive)', () => {
    // anchor is 2026-07-14; 30 days back is 2026-06-15
    const filtered = filterByRange(points, 30, anchor);
    expect(filtered.map((p) => p.date)).toEqual(['2026-06-20', '2026-07-01', '2026-07-14']);
  });

  it('uses the passed-in anchor, not the array\'s own last element', () => {
    // Sparse array whose last element is far before the real anchor — this is exactly
    // the raw-weigh-in-series situation the explicit-anchor design exists to handle.
    const sparse = [{ date: '2026-07-01' }, { date: '2026-06-01' }];
    const filtered = filterByRange(sparse, 30, '2026-07-14');
    expect(filtered.map((p) => p.date)).toEqual(['2026-07-01']);
  });

  it('is a no-op on an empty array', () => {
    expect(filterByRange([], 30, anchor)).toEqual([]);
  });

  it('returns a new array, not a mutated reference, even for "all"', () => {
    const result = filterByRange(points, 'all', anchor);
    expect(result).not.toBe(points);
  });
});
