// §9.9. Reads via dexie-react-hooks' useLiveQuery (the idiomatic Dexie+React pattern —
// already a project dependency, unused until this part); writes are plain async
// functions components call directly, and the live query re-renders automatically on
// the next Dexie write to either table (that's what "live" means here — no manual
// refetch/invalidation wiring needed).
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import type { HabitDefinition, HabitEntry } from '../../types';

export interface HabitsData {
  habits: HabitDefinition[];
  entries: HabitEntry[];
}

/** All habit definitions plus every entry ever logged for them. Entries aren't
 * date-scoped here (unlike HistoryTrends' full-history approach) — HabitHistoryGrid
 * decides its own display window, and at this app's scale (a handful of habits × at
 * most a few thousand days) fetching everything is the same trivial-cost tradeoff used
 * throughout this part; see dailyLogTotals.ts. */
export function useHabitsData(): HabitsData | undefined {
  return useLiveQuery(async () => {
    const [habits, entries] = await Promise.all([
      db.habitDefinitions.toArray(),
      db.habitEntries.toArray(),
    ]);
    return { habits, entries };
  }, []);
}

export async function createHabit(name: string, icon?: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Habit name cannot be empty');
  const habit: HabitDefinition = { id: crypto.randomUUID(), name: trimmed, icon, active: true };
  await db.habitDefinitions.add(habit);
}

export async function updateHabit(
  id: string,
  changes: Partial<Pick<HabitDefinition, 'name' | 'icon'>>,
): Promise<void> {
  const patch = { ...changes };
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error('Habit name cannot be empty');
    patch.name = trimmed;
  }
  await db.habitDefinitions.update(id, patch);
}

export async function setHabitActive(id: string, active: boolean): Promise<void> {
  await db.habitDefinitions.update(id, { active });
}

/** Flips a single day's completion for a habit. Upserts: if today has no entry yet for
 * this habit, the first tap creates one as completed:true; if one exists, the tap flips
 * it. This is the one write path both the fast "today" check-off and the retroactive
 * history-grid tap both go through, so they can't drift out of sync with each other. */
export async function toggleHabitEntry(habitId: string, date: string): Promise<void> {
  const existing = await db.habitEntries.where('[habitId+date]').equals([habitId, date]).first();
  if (existing) {
    await db.habitEntries.update(existing.id, { completed: !existing.completed });
  } else {
    const entry: HabitEntry = { id: crypto.randomUUID(), habitId, date, completed: true };
    await db.habitEntries.add(entry);
  }
}
