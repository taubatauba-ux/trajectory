// §9.8: "Adherence view: logged-days streak, average macro accuracy vs. target over
// trailing 7/30 days." All pure functions — no Dexie, no React — so they're unit
// testable in isolation and so index.tsx stays a thin wiring layer.
//
// The Engine's replay (adaptiveTdeeEngine.ts's `debug.replay`) only carries
// `displayedTargetKcal` per historical day, not a full historical macro split — Module F
// only computes the protein/fat/carb split once, for *today's* final point (see
// adaptiveTdeeEngine.ts's one call to splitMacros). To compare logged protein/fat/carb
// against a target for days other than today, this file calls that same exported,
// stateless `splitMacros(targetKcal, bodyWeightKg)` function per historical day, using
// that day's own `displayedTargetKcal` and Kalman-estimated `state.W`. This is NOT new
// estimation/smoothing logic in the app layer (which §9.8 explicitly forbids for this
// screen, and engine.types.ts forbids project-wide) — it's exact reuse of the Engine's
// own deterministic arithmetic, applied to a historical day instead of today. See
// PART5_PROGRESS_REPORT.md for the full reasoning.
import type { Macros } from '../../types';
import type { DailyReplayPoint } from '../../engine/callEngine';
import { splitMacros } from '../../engine/targetLimiter';
import { addDaysISO, daysBetweenISO } from '../_shared/dates';
import { computeConsecutiveDayStreak } from '../_shared/streaks';

/** One historical day's reconstructed target, keyed by date. Only the four macros
 * splitMacros actually computes — fiber/sugar/etc. were never part of the target split
 * to begin with (§7's Macros type), so there's nothing to reconstruct for those. */
export function reconstructHistoricalTargets(replay: DailyReplayPoint[]): Map<string, Macros> {
  const targets = new Map<string, Macros>();
  for (const point of replay) {
    const split = splitMacros(point.displayedTargetKcal, point.state.W);
    targets.set(point.date, split);
  }
  return targets;
}

/**
 * Consecutive logged days counting back from `today` — a thin, History-specific-named
 * re-export of the shared streak algorithm (see _shared/streaks.ts's own doc comment
 * for the full "today not counted against you" semantics; Habit Tracker uses the same
 * function directly for its own per-habit streaks).
 */
export function computeLoggedDaysStreak(loggedDates: ReadonlySet<string>, today: string): number {
  return computeConsecutiveDayStreak(loggedDates, today);
}

/** 100 = exact match, 0 = off by ≥100% of target (or more; clamped). Symmetric — over
 * and under target are penalized the same, since "accuracy" here means closeness, not
 * a directional adherence-to-a-diet judgment. */
function accuracyPercent(actual: number, target: number): number {
  if (target === 0) return actual === 0 ? 100 : 0;
  const pctOff = Math.abs(actual - target) / target;
  return Math.round(Math.max(0, Math.min(100, 100 * (1 - pctOff))));
}

export interface MacroAccuracy {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
}

export function computeMacroAccuracy(actual: Macros, target: Macros): MacroAccuracy {
  return {
    kcal: accuracyPercent(actual.kcal, target.kcal),
    proteinG: accuracyPercent(actual.proteinG, target.proteinG),
    fatG: accuracyPercent(actual.fatG, target.fatG),
    carbG: accuracyPercent(actual.carbG, target.carbG),
  };
}

export interface AdherenceWindowSummary {
  windowDays: number;
  /** How many days in the window have a logged total — distinct from accuracy, since
   * "didn't log" and "logged but off-target" are different failure modes worth telling
   * apart rather than conflating into one number. */
  loggedDaysInWindow: number;
  /** Average of computeMacroAccuracy across logged days only. Null if zero logged days
   * in the window — an average of nothing isn't 0%, it's undefined. */
  avgAccuracy: MacroAccuracy | null;
}

/**
 * `windowDays` counts back from (and includes) `today`, regardless of whether today
 * itself has been logged yet. `dailyTotals` and `historicalTargets` are both keyed by
 * date; a day missing from either is simply excluded from the average, not treated as
 * a zero.
 */
export function computeAdherenceForWindow(
  windowDays: number,
  today: string,
  dailyTotals: ReadonlyMap<string, Macros>,
  historicalTargets: ReadonlyMap<string, Macros>,
): AdherenceWindowSummary {
  const windowStart = addDaysISO(today, -(windowDays - 1));
  const perDayAccuracy: MacroAccuracy[] = [];

  for (const date of dailyTotals.keys()) {
    if (daysBetweenISO(windowStart, date) < 0 || daysBetweenISO(date, today) < 0) continue;
    const target = historicalTargets.get(date);
    const actual = dailyTotals.get(date);
    if (!target || !actual) continue;
    perDayAccuracy.push(computeMacroAccuracy(actual, target));
  }

  if (perDayAccuracy.length === 0) {
    return { windowDays, loggedDaysInWindow: 0, avgAccuracy: null };
  }

  const avg = (key: keyof MacroAccuracy) =>
    Math.round(perDayAccuracy.reduce((sum, a) => sum + a[key], 0) / perDayAccuracy.length);

  return {
    windowDays,
    loggedDaysInWindow: perDayAccuracy.length,
    avgAccuracy: {
      kcal: avg('kcal'),
      proteinG: avg('proteinG'),
      fatG: avg('fatG'),
      carbG: avg('carbG'),
    },
  };
}
