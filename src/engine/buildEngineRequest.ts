import type { UserProfile, WeighIn, LogEntry, Macros } from '../types';
import type { EngineRequest } from './engine.types';
import { sumMacrosList } from '../lib/macros';
import { todayISO } from '../lib/dateUtils';

/**
 * Assembles an EngineRequest (§1.3) from the raw tables Dexie hands back.
 *
 * The one non-obvious decision here: **today's date is always excluded from
 * `history.dailyLogs`**, even if the user has already logged food today. `LogEntry`s
 * accumulate throughout the day, so "today's total" is a moving target — a call made at
 * 9am after only breakfast would hand the Kalman filter (adaptiveTdeeEngine.ts) a total
 * that looks like a near-fast day, when really the day just isn't over. The filter has
 * no way to know a given date's total is partial versus final; from its side, whatever's
 * in the map for a date IS that day's total (see the `intakeByDate.get(date)` lookup in
 * adaptiveTdeeEngine.ts). Today's real total becomes available the moment today turns
 * into a completed day in history — i.e. from tomorrow's call onward.
 *
 * This applies to any caller (Dashboard, and eventually Check-in, §9.6), so it lives
 * here rather than being reimplemented per screen.
 *
 * Weigh-ins are NOT filtered the same way: WeighIn (§4.1) is "one per calendar day,
 * upsert on duplicate", so whatever's stored for today is already a finished value the
 * moment it exists, not an accumulating one — there's nothing partial to exclude.
 */
export function buildEngineRequest(
  profile: UserProfile,
  weighIns: WeighIn[],
  logEntries: LogEntry[],
  asOf: Date = new Date(),
): EngineRequest {
  const today = todayISO(asOf);

  const macrosByDate = new Map<string, Macros[]>();
  for (const entry of logEntries) {
    if (entry.date === today) continue;
    const bucket = macrosByDate.get(entry.date);
    if (bucket) bucket.push(entry.macrosAtLogTime);
    else macrosByDate.set(entry.date, [entry.macrosAtLogTime]);
  }

  const dailyLogs = Array.from(macrosByDate.entries()).map(([date, macrosList]) => ({
    date,
    totals: sumMacrosList(macrosList),
  }));

  return { profile, history: { weighIns, dailyLogs } };
}
