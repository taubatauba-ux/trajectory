// Aggregates LogEntry (§4.3) rows into the `{ date, totals }[]` shape
// EngineRequest.history.dailyLogs expects (engine/engine.types.ts, §1.3 of the TDEE
// spec). Nothing in Part 1 built this — the Engine consumes daily totals but nothing
// yet produced them from individual LogEntry rows. Check-in (§9.6, Part 4) needs it to
// call the Engine with real history instead of an empty array. Likely also useful to
// Part 3's Dashboard for its own "today's totals" — a plain, unopinionated aggregation
// with no screen-specific logic, so reuse there should be safe if wanted.
import { db } from './db';
import type { LogEntry } from '../types/logging';
import type { Macros } from '../types/food';
import { sumMacros } from './macrosMath';

/** Every LogEntry.macrosAtLogTime for a single day, summed. Uses the snapshot stored at
 * log time (§4.3: "editing a food later must never rewrite history"), never re-derives
 * from the current FoodItem. */
export function totalsForDay(entries: LogEntry[]): Macros {
  return sumMacros(entries.map((e) => e.macrosAtLogTime));
}

/** All logged days, oldest first — the exact shape the Engine's `history.dailyLogs`
 * expects. Days with zero entries simply don't appear (nothing to sum), matching how the
 * Engine's own day-by-day replay already treats "no log that day" (adaptiveTdeeEngine.ts
 * looks up `intakeByDate.get(date)`, undefined is a valid, expected case there). */
export async function getDailyLogsHistory(): Promise<{ date: string; totals: Macros }[]> {
  const allEntries = await db.logEntries.toArray();
  const byDate = new Map<string, LogEntry[]>();
  for (const entry of allEntries) {
    const list = byDate.get(entry.date);
    if (list) list.push(entry);
    else byDate.set(entry.date, [entry]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => ({ date, totals: totalsForDay(entries) }));
}
