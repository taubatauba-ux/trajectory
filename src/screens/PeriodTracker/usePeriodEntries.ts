// §9.10. Same useLiveQuery-for-reads / plain-async-functions-for-writes pattern as
// useHabits.ts (HabitTracker) and useEngineHistory.ts (HistoryTrends) — kept local to
// this screen rather than factored into one shared "useDexieTable" hook, since each of
// the three has different enough read/write shapes (Period's upsert-by-date is not
// Habit's upsert-by-[habitId+date], and neither touches the Engine) that a shared
// abstraction would mostly be indirection. See PART5_PROGRESS_REPORT.md.
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import type { PeriodEntry, PeriodFlow } from '../../types';

export function usePeriodEntries(): PeriodEntry[] | undefined {
  return useLiveQuery(() => db.periodEntries.toArray(), []);
}

export interface DayEntryInput {
  flow?: PeriodFlow;
  symptoms?: string[];
}

/**
 * Upserts a date's entry. Passing `{}` (no flow, no symptoms) deletes the entry
 * entirely rather than leaving an empty row behind — an empty PeriodEntry isn't
 * meaningfully different from no entry, and keeping it around would make
 * segmentIntoEpisodes' `flow !== undefined` filter do the same job less transparently.
 */
export async function setDayEntry(date: string, input: DayEntryInput): Promise<void> {
  const isEmpty = input.flow === undefined && (input.symptoms === undefined || input.symptoms.length === 0);
  const existing = await db.periodEntries.where('date').equals(date).first();

  if (isEmpty) {
    if (existing) await db.periodEntries.delete(existing.id);
    return;
  }

  if (existing) {
    await db.periodEntries.update(existing.id, { flow: input.flow, symptoms: input.symptoms });
  } else {
    const entry: PeriodEntry = { id: crypto.randomUUID(), date, flow: input.flow, symptoms: input.symptoms };
    await db.periodEntries.add(entry);
  }
}
