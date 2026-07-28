// §9.9: daily binary check-off plus a full history grid. The grid needs, per habit,
// some sense of "how's this going" beyond the raw grid of checkmarks — a streak and a
// completion rate are the two numbers every habit tracker in this genre shows, and both
// are simple aggregates over HabitEntry (§4.5), computed here as pure functions so
// HabitHistoryGrid and HabitRow stay presentational.
import type { HabitEntry } from '../../types';
import { computeConsecutiveDayStreak } from '../_shared/streaks';
import { addDaysISO, daysBetweenISO } from '../_shared/dates';

/** Dates this specific habit was marked completed — an entry with completed:false is
 * NOT activity (the user explicitly said "not done"), same as no entry at all. */
export function completedDatesForHabit(entries: readonly HabitEntry[], habitId: string): Set<string> {
  const dates = new Set<string>();
  for (const e of entries) {
    if (e.habitId === habitId && e.completed) dates.add(e.date);
  }
  return dates;
}

export function computeHabitStreak(entries: readonly HabitEntry[], habitId: string, today: string): number {
  return computeConsecutiveDayStreak(completedDatesForHabit(entries, habitId), today);
}

export interface CompletionStats {
  completed: number;
  windowDays: number;
}

/** How many of the trailing `windowDays` (ending at and including `today`) this habit
 * was completed on. No knowledge of when the habit was created — HabitDefinition (§4.5)
 * doesn't carry a createdAt — so a habit made yesterday will honestly show something
 * like 1/7 rather than a misleadingly-scoped 1/1; see PART5_PROGRESS_REPORT.md. */
export function computeCompletionStats(
  entries: readonly HabitEntry[],
  habitId: string,
  windowDays: number,
  today: string,
): CompletionStats {
  const completedDates = completedDatesForHabit(entries, habitId);
  const windowStart = addDaysISO(today, -(windowDays - 1));
  let completed = 0;
  for (const date of completedDates) {
    if (daysBetweenISO(windowStart, date) >= 0 && daysBetweenISO(date, today) >= 0) completed++;
  }
  return { completed, windowDays };
}
