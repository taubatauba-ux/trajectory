// Small date-math helpers shared by the four Part 5 screens (History & Trends, Habit
// Tracker, Period Tracker, Progress Photos). Scoped under src/screens/_shared/ rather
// than a project-wide src/lib/ — this project doesn't have a shared date-utils module
// yet (engine/adaptiveTdeeEngine.ts hand-rolls its own private copies of
// enumerateDates/toDateOnly/addDaysISO rather than importing one), so adding a
// project-wide one isn't this part's call to make unilaterally while Parts 2-4 are
// being built in parallel against the same checkpoint. This file exists so History,
// Habits, Period, and Photos don't each reimplement the same day-arithmetic slightly
// differently — see PART5_PROGRESS_REPORT.md for the reasoning.
//
// CRITICAL CONVENTION, matching engine/adaptiveTdeeEngine.ts exactly: every date is
// treated as a UTC calendar day, never local time. A date string like "2026-07-14" is
// parsed as "2026-07-14T00:00:00Z", and "today" is derived from `now.toISOString()`,
// not `now.getFullYear()/getMonth()/getDate()` (which would read the *local* calendar
// date). This matters because WeighIn.date / LogEntry.date / the Engine's own
// `debug.replay[i].date` all use this same UTC-anchored convention (see
// adaptiveTdeeEngine.ts's `toDateOnly`/`enumerateDates`) — mixing local-time date math
// into just the Part 5 screens would silently misalign chart x-axes and streak counts
// by a day for anyone not at UTC+0. This IS a known project-wide quirk (see
// PART5_PROGRESS_REPORT.md) worth a future part's attention, not something to
// half-fix here by diverging.

/** 'YYYY-MM-DD' for the given instant (defaults to now), as a UTC calendar date. */
export function todayISO(now: Date = new Date()): string {
  return toDateOnly(now.toISOString());
}

/** Normalizes any ISO date or datetime string to its 'YYYY-MM-DD' date-only prefix. */
export function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True for a well-formed 'YYYY-MM-DD' string representing a real calendar date. */
export function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  // Catches both NaN (malformed) and overflow (e.g. "2026-02-30" silently rolling to
  // March) by checking the round-tripped string still matches.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Adds (or subtracts, for negative `days`) whole days to a 'YYYY-MM-DD' string. */
export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** b − a, in whole days. Positive when b is after a. */
export function daysBetweenISO(aISO: string, bISO: string): number {
  const a = new Date(aISO + 'T00:00:00Z').getTime();
  const b = new Date(bISO + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Every 'YYYY-MM-DD' from start to end inclusive. Empty array if end < start. */
export function enumerateDatesISO(startISO: string, endISO: string): string[] {
  if (daysBetweenISO(startISO, endISO) < 0) return [];
  const dates: string[] = [];
  let cursor = startISO;
  while (cursor <= endISO) {
    dates.push(cursor);
    cursor = addDaysISO(cursor, 1);
  }
  return dates;
}

/** 0 = Sunday … 6 = Saturday, for the given 'YYYY-MM-DD', per its UTC calendar day. */
export function weekdayIndex(dateISO: string): number {
  return new Date(dateISO + 'T00:00:00Z').getUTCDay();
}

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** e.g. "14 Jul" — day-month order throughout (avoids MM/DD vs DD/MM ambiguity), no
 * year unless `withYear` is set (chart axes and list rows rarely need the year; the CSV
 * export and comparison-view captions do). */
export function formatDisplayDate(dateISO: string, withYear = false): string {
  const [y, m, d] = dateISO.split('-');
  const day = String(Number(d));
  const month = MONTH_ABBR[Number(m) - 1] ?? m;
  return withYear ? `${day} ${month} ${y}` : `${day} ${month}`;
}

export function formatWeekdayAbbr(dateISO: string): string {
  return WEEKDAY_ABBR[weekdayIndex(dateISO)] ?? '';
}

export function monthLabel(year: number, monthIndex0: number): string {
  return `${MONTH_ABBR[monthIndex0] ?? monthIndex0 + 1} ${year}`;
}

/** Days in a given UTC month. `monthIndex0` is 0-based (0 = January), matching `Date`. */
export function daysInMonth(year: number, monthIndex0: number): number {
  // Day 0 of "next month" is the last day of this month — a standard JS Date trick,
  // done in UTC here to stay consistent with this file's UTC-only convention.
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

export interface MonthGridCell {
  dateISO: string | null; // null = padding cell outside this month, kept for grid alignment
}

/**
 * A 6×7 (weeks × weekdays, Sun-first) grid of the given month, padded with `null` cells
 * before day 1 and after the last day so every row has exactly 7 entries and the grid is
 * always 6 rows — a fixed shape simplifies the calendar component (Period Tracker,
 * §9.10) since it never needs to vary its own layout by month length.
 */
export function getMonthGrid(year: number, monthIndex0: number): MonthGridCell[][] {
  const totalDays = daysInMonth(year, monthIndex0);
  const firstDateISO = `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-01`;
  const leadingBlanks = weekdayIndex(firstDateISO);

  const cells: MonthGridCell[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ dateISO: null });
  for (let day = 1; day <= totalDays; day++) {
    cells.push({ dateISO: `${year}-${String(monthIndex0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` });
  }
  while (cells.length < 42) cells.push({ dateISO: null }); // pad to a full 6×7

  const weeks: MonthGridCell[][] = [];
  for (let i = 0; i < 42; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Clamps a UTC (year, monthIndex0) pair returned by e.g. `addMonths(2026, 0, -1)`. */
export function addMonths(year: number, monthIndex0: number, delta: number): { year: number; monthIndex0: number } {
  const total = year * 12 + monthIndex0 + delta;
  return { year: Math.floor(total / 12), monthIndex0: ((total % 12) + 12) % 12 };
}
