import { addDaysISO } from './dates';

/**
 * Length of the run of consecutive dates ending at (or just before) `today` that are
 * present in `datesWithActivity`. If today itself isn't in the set, that alone doesn't
 * break the streak — the day isn't over yet — so counting starts from yesterday
 * instead. A real gap in the past (a date missing from the set, with activity on both
 * sides) does end the streak there.
 *
 * Generic over what "activity" means: History & Trends uses it for logged-days (a date
 * counts if there's a log entry that day), Habit Tracker uses it per-habit (a date
 * counts if that habit was marked completed that day). Both are exactly this same
 * walk-backward-from-today algorithm, so it lives here once rather than twice.
 */
export function computeConsecutiveDayStreak(datesWithActivity: ReadonlySet<string>, today: string): number {
  let cursor = datesWithActivity.has(today) ? today : addDaysISO(today, -1);
  let streak = 0;
  while (datesWithActivity.has(cursor)) {
    streak++;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}
