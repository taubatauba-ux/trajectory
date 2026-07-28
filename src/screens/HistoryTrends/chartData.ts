// §9.8: "both plot whatever series the Engine returns; this screen does zero
// smoothing/estimation math itself." Everything here is reshaping/rounding for display
// — no filtering of "which points are real", no interpolation, no derived estimates
// beyond what sdTdee/sdWeight already compute from the Engine's own covariance output.
import type { DailyReplayPoint } from '../../engine/callEngine';
import { sdTdee } from '../../engine/kalmanFilter';
import type { WeighIn } from '../../types';

export interface WeightTrendPoint {
  date: string;
  trendWeightKg: number;
}

export interface RawWeighInPoint {
  date: string;
  rawWeightKg: number;
  isOutlier: boolean;
}

export interface ExpenditurePoint {
  date: string;
  tdee: number;
  /** Stacked-area confidence-band trick: an invisible floor Area at `lower`, topped by
   * a visible Area of height `bandWidth`, together rendering as a TDEE±SD band. */
  lower: number;
  bandWidth: number;
}

/** The continuous Kalman-filtered trend line — one point per day in the replay,
 * including predict-only days with no weigh-in that day. */
export function buildWeightTrendSeries(replay: readonly DailyReplayPoint[]): WeightTrendPoint[] {
  return replay.map((point) => ({
    date: point.date,
    trendWeightKg: Math.round(point.state.W * 10) / 10,
  }));
}

/** Only the days an actual weigh-in was logged — sparse, plotted as discrete markers
 * over the continuous trend line. `isOutlier` comes straight from the replay's own
 * `outlierFlagged` for that date (Module D, adaptive-tdee-engine-spec-v2.md §6) — this
 * function doesn't decide what counts as an outlier, it just looks up what the Engine
 * already decided. */
export function buildRawWeighInSeries(
  replay: readonly DailyReplayPoint[],
  weighIns: readonly WeighIn[],
): RawWeighInPoint[] {
  const outlierByDate = new Map(replay.map((p) => [p.date, p.outlierFlagged]));
  return weighIns
    .map((w) => ({
      date: w.date,
      rawWeightKg: Math.round(w.weightKg * 10) / 10,
      isOutlier: outlierByDate.get(w.date) ?? false,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** TDEE line plus a ±1 SD band computed from the replay's own covariance. Per
 * adaptive-tdee-engine-spec-v2.md §5.7, this band is *not* the total uncertainty
 * (parameter uncertainty in ρ_eff isn't propagated into it) — ExpenditureChart is
 * responsible for captioning that, this function just supplies the numbers. */
export function buildExpenditureSeries(replay: readonly DailyReplayPoint[]): ExpenditurePoint[] {
  return replay.map((point) => {
    const sd = sdTdee(point.cov);
    const tdee = Math.round(point.state.TDEE);
    const lower = Math.round(point.state.TDEE - sd);
    const upper = Math.round(point.state.TDEE + sd);
    return { date: point.date, tdee, lower, bandWidth: upper - lower };
  });
}

export type ChartRange = 30 | 90 | 180 | 'all';

/**
 * Trailing-N-days filter shared by both charts' range selector. Takes an explicit
 * `anchorDateISO` (rather than inferring "today" from the array's own last element)
 * because WeightTrendChart's two series are different lengths — `trend` has one point
 * per day and its last entry really is today, but `raw` only has actual weigh-in days
 * and its last entry could be from weeks ago. Inferring the anchor separately per array
 * would silently give trend and raw two different cutoff dates. Callers should compute
 * one anchor (the replay's last date) and pass it to every series being filtered
 * together.
 */
export function filterByRange<T extends { date: string }>(
  points: readonly T[],
  range: ChartRange,
  anchorDateISO: string,
): T[] {
  if (range === 'all') return [...points];
  const cutoff = new Date(anchorDateISO + 'T00:00:00Z');
  cutoff.setUTCDate(cutoff.getUTCDate() - (range - 1));
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  return points.filter((p) => p.date >= cutoffISO);
}
