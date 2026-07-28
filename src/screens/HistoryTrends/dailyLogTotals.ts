// Aggregates raw LogEntry rows into one Macros total per calendar day. Not specified
// verbatim by either source document — trajectory-app-technical-specification.md's
// `DailyLog.totals` (§4.3) is documented as "cached/derived, recompute on any entry
// change" but no shared helper for that recomputation exists yet in src/data/ (Part 3,
// building the core logging loop in parallel, may end up needing the same aggregation
// for the Dashboard's daily ring). Deliberately kept local to this screen rather than
// added to src/data/db.ts — see PART5_PROGRESS_REPORT.md's "possible duplication"
// note. If Part 3 already built an equivalent by the time these land together, prefer
// theirs and delete this file; the two are meant to be interchangeable (same output
// shape: Map<dateISO, Macros>).
import type { LogEntry, Macros } from '../../types';
import { db } from '../../data/db';
import { toDateOnly } from '../_shared/dates';

const OPTIONAL_MACRO_KEYS = ['fiberG', 'sugarG', 'sodiumMg', 'ironMg', 'calciumMg'] as const;

/** Sums a list of Macros snapshots (LogEntry.macrosAtLogTime, §4.3 — logging always uses
 * the snapshot, never a live re-lookup of the food item, so edits to a food later don't
 * rewrite history). Required fields always sum (0 for an empty list); an optional field
 * is present on the result only if at least one input had it, and only sums the inputs
 * that defined it — silently treating "not tracked for this food" the same as "tracked
 * as zero" would misrepresent foods ICMR/OFF haven't got that nutrient for (§4.2's own
 * comment: "-" / not-analyzed becomes `undefined`, not 0).
 */
export function sumMacros(macrosList: Macros[]): Macros {
  const total: Macros = { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 };
  for (const m of macrosList) {
    total.kcal += m.kcal;
    total.proteinG += m.proteinG;
    total.fatG += m.fatG;
    total.carbG += m.carbG;
  }
  for (const key of OPTIONAL_MACRO_KEYS) {
    const present = macrosList.filter((m) => typeof m[key] === 'number');
    if (present.length > 0) {
      total[key] = present.reduce((sum, m) => sum + (m[key] as number), 0);
    }
  }
  return total;
}

/** Groups entries by (date-normalized) date and sums each group's macrosAtLogTime. */
export function computeDailyTotals(entries: LogEntry[]): Map<string, Macros> {
  const byDate = new Map<string, Macros[]>();
  for (const entry of entries) {
    const date = toDateOnly(entry.date);
    const list = byDate.get(date);
    if (list) {
      list.push(entry.macrosAtLogTime);
    } else {
      byDate.set(date, [entry.macrosAtLogTime]);
    }
  }
  const totals = new Map<string, Macros>();
  for (const [date, macrosList] of byDate) {
    totals.set(date, sumMacros(macrosList));
  }
  return totals;
}

/** Every logged day's totals, full history — the Engine replay needs every day on
 * record, not a trailing window (see useEngineHistory.ts), so this deliberately doesn't
 * take a date-range parameter. At the data volumes this app deals in (per
 * adaptiveTdeeEngine.ts's own "at most a few thousand days" framing), fetching
 * everything and aggregating client-side is the same trivial-cost tradeoff the Engine
 * itself already makes, not a new performance risk this screen introduces. */
export async function getAllDailyTotals(): Promise<Map<string, Macros>> {
  const entries = await db.logEntries.toArray();
  return computeDailyTotals(entries);
}
