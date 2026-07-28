import type { Macros } from '../types';

// Pure math only — no I/O, no engine logic. Kept generic over every optional
// micronutrient field (not just the "big four") so summing a day's entries never
// silently drops fiber/sodium/iron/calcium data that a later screen (Trends, Food
// Detail) might legitimately want. Extend this list if Macros (§4.2) ever grows.
const OPTIONAL_MACRO_KEYS = ['fiberG', 'sugarG', 'sodiumMg', 'ironMg', 'calciumMg'] as const;

export const ZERO_MACROS: Macros = { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 };

export function addMacros(a: Macros, b: Macros): Macros {
  const sum: Macros = {
    kcal: a.kcal + b.kcal,
    proteinG: a.proteinG + b.proteinG,
    fatG: a.fatG + b.fatG,
    carbG: a.carbG + b.carbG,
  };
  for (const key of OPTIONAL_MACRO_KEYS) {
    const av = a[key];
    const bv = b[key];
    // Only carry the key at all if at least one side actually had it — keeps a sum of
    // items that never report sodium from fabricating a fake "0mg sodium" claim.
    if (av !== undefined || bv !== undefined) {
      sum[key] = (av ?? 0) + (bv ?? 0);
    }
  }
  return sum;
}

export function sumMacrosList(list: Macros[]): Macros {
  return list.reduce(addMacros, ZERO_MACROS);
}

/** Scales a per-100g macro profile to an arbitrary gram amount — the same math backs
 * LogEntry.macrosAtLogTime at log time (§4.3) and the live preview while adjusting a
 * quantity before adding. */
export function scaleMacros(per100g: Macros, grams: number): Macros {
  const factor = grams / 100;
  const scaled: Macros = {
    kcal: per100g.kcal * factor,
    proteinG: per100g.proteinG * factor,
    fatG: per100g.fatG * factor,
    carbG: per100g.carbG * factor,
  };
  for (const key of OPTIONAL_MACRO_KEYS) {
    const v = per100g[key];
    if (v !== undefined) scaled[key] = v * factor;
  }
  return scaled;
}

/** Consumed/target, safe against a zero or not-yet-available target (e.g. the very first
 * render before the engine has responded). Intentionally unclamped — callers decide
 * whether "142%" means "draw an overflowing ring" or "color the number as over target". */
export function ratio(consumed: number, target: number): number {
  return target > 0 ? consumed / target : 0;
}

export function roundKcal(kcal: number): number {
  return Math.round(kcal);
}

export function roundGrams(grams: number): number {
  return Math.round(grams);
}
