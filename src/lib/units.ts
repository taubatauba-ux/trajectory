import type { UserProfile } from '../types/profile';

export type UnitPreference = NonNullable<UserProfile['unitPreference']>;

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function cmToIn(cm: number): number {
  return cm / CM_PER_IN;
}

export function inToCm(inches: number): number {
  return inches * CM_PER_IN;
}

/** Height in imperial is conventionally feet+inches, not decimal inches — this is the
 * one place that distinction matters (weight has no equivalent split unit in common
 * use). `inches` is already rounded to the nearest whole inch, and carries when it
 * would round up to 12. */
export function cmToFtIn(cm: number): { ft: number; inches: number } {
  const totalInches = Math.round(cmToIn(cm));
  const ft = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { ft, inches };
}

export function ftInToCm(ft: number, inches: number): number {
  return inToCm(ft * 12 + inches);
}

/** Weight, rounded to a sensible display precision per unit (1 decimal for kg, whole
 * number for lb — matches how each unit is conventionally read/reported). */
export function formatWeight(kg: number, unit: UnitPreference): string {
  if (unit === 'imperial') return `${Math.round(kgToLb(kg))} lb`;
  return `${Math.round(kg * 10) / 10} kg`;
}

/** Height as a single formatted string — `5'10"` for imperial, `178 cm` for metric. */
export function formatHeight(cm: number, unit: UnitPreference): string {
  if (unit === 'imperial') {
    const { ft, inches } = cmToFtIn(cm);
    return `${ft}'${inches}"`;
  }
  return `${Math.round(cm)} cm`;
}

export function weightUnitLabel(unit: UnitPreference): 'kg' | 'lb' {
  return unit === 'imperial' ? 'lb' : 'kg';
}

/** The bare number for an editable weight field in the given unit — pair with
 * `weightUnitLabel` for the suffix, and `parseWeightInput` to convert a typed value
 * back to kg for storage. Kept as a separate function from `formatWeight` (rather than
 * stripping the unit off that string) since an input field wants a plain editable
 * number, not a rounded display string with a unit baked in. */
export function toDisplayWeightValue(kg: number, unit: UnitPreference): number {
  if (unit === 'imperial') return Math.round(kgToLb(kg) * 10) / 10;
  return Math.round(kg * 10) / 10;
}

/** Inverse of `toDisplayWeightValue` — converts a number the user typed, already in
 * their preferred unit, back to kg for storage. Every Dexie value stays kg regardless
 * of preference (§4) — this is the one boundary where that conversion happens. */
export function parseWeightInput(value: number, unit: UnitPreference): number {
  return unit === 'imperial' ? lbToKg(value) : value;
}
