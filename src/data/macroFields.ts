// §9.4: "Full macro breakdown (all populated fields from Macros, not just the four
// headline ones)". This is the display metadata (label/unit/grouping) for every field
// Macros (§4.2) can carry, kept in one place so Food Detail and Recipe Builder render
// the same fields the same way.
import type { Macros } from '../types/food';

export interface MacroFieldDef {
  key: keyof Macros;
  label: string;
  unit: string;
  /** Headline fields are always present (required on Macros); extended are optional and
   * only shown when actually populated. */
  headline: boolean;
}

export const MACRO_FIELDS: MacroFieldDef[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal', headline: true },
  { key: 'proteinG', label: 'Protein', unit: 'g', headline: true },
  { key: 'fatG', label: 'Fat', unit: 'g', headline: true },
  { key: 'carbG', label: 'Carbs', unit: 'g', headline: true },
  { key: 'fiberG', label: 'Fiber', unit: 'g', headline: false },
  { key: 'sugarG', label: 'Sugar', unit: 'g', headline: false },
  { key: 'sodiumMg', label: 'Sodium', unit: 'mg', headline: false },
  { key: 'ironMg', label: 'Iron', unit: 'mg', headline: false },
  { key: 'calciumMg', label: 'Calcium', unit: 'mg', headline: false },
];

/** All fields actually present on a given Macros value — headline fields always qualify,
 * extended fields only when populated (§4.2: absent means untracked, never render as 0). */
export function populatedMacroFields(macros: Macros): { def: MacroFieldDef; value: number }[] {
  return MACRO_FIELDS.filter((def) => def.headline || macros[def.key] !== undefined).map((def) => ({
    def,
    value: macros[def.key]!,
  }));
}

/** Round for display: whole numbers for everything except fields that are commonly
 * fractional at gram-level precision (protein/fat/carb/fiber/sugar keep one decimal;
 * kcal and the mg fields read better rounded to whole numbers). */
export function formatMacroValue(def: MacroFieldDef, value: number): string {
  if (def.unit === 'mg' || def.key === 'kcal') return Math.round(value).toString();
  return (Math.round(value * 10) / 10).toString();
}
