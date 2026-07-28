// Shared, boring arithmetic on Macros (§4.2) — used anywhere multiple Macros need to be
// combined into one: the recipe calculator (§7, summing scaled ingredients) and daily-log
// aggregation (summing a day's LogEntry.macrosAtLogTime snapshots for the Engine's
// `history.dailyLogs`, §1.3). Pulled into its own file so that logic exists exactly once.
import type { Macros } from '../types/food';

const OPTIONAL_MACRO_KEYS = ['fiberG', 'sugarG', 'sodiumMg', 'ironMg', 'calciumMg'] as const;

/** Multiply every present field by `factor`. Required fields always survive; an absent
 * optional field stays absent (0 × unknown is still unknown, not 0). */
export function scaleMacros(m: Macros, factor: number): Macros {
  const result: Macros = {
    kcal: m.kcal * factor,
    proteinG: m.proteinG * factor,
    fatG: m.fatG * factor,
    carbG: m.carbG * factor,
  };
  for (const key of OPTIONAL_MACRO_KEYS) {
    const value = m[key];
    if (value !== undefined) result[key] = value * factor;
  }
  return result;
}

/**
 * Sum a list of Macros. Required fields always sum (0 for an empty list). An optional
 * field sums across only the entries that report it; if none do, it's omitted from the
 * result rather than shown as a confidently-wrong 0 — "untracked" and "zero" are different
 * facts and this keeps them distinguishable all the way through aggregation.
 */
export function sumMacros(list: Macros[]): Macros {
  const total: Macros = { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 };
  for (const m of list) {
    total.kcal += m.kcal;
    total.proteinG += m.proteinG;
    total.fatG += m.fatG;
    total.carbG += m.carbG;
    for (const key of OPTIONAL_MACRO_KEYS) {
      const value = m[key];
      if (value !== undefined) total[key] = (total[key] ?? 0) + value;
    }
  }
  return total;
}
