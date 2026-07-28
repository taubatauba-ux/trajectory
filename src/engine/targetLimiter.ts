// Module F — Target & Rate Limiter. Source of truth: adaptive-tdee-engine-spec-v2.md §8.

/** §8.1 */
export function computeRawTargetKcal(
  tdeeEstimate: number,
  desiredWeeklyRateKg: number,
  rhoEff: number,
): number {
  return tdeeEstimate + (desiredWeeklyRateKg * rhoEff) / 7;
}

/**
 * §8.2 — caps week-over-week *displayed* target movement, distinct from Module C's own
 * gain-based smoothing of the *estimate*. `previousDisplayedTarget` is what was shown
 * to the user 7 days ago (or `undefined` on the very first target, when there's nothing
 * to limit against yet).
 */
export function applyRateLimiter(
  rawTargetKcal: number,
  previousDisplayedTargetKcal: number | undefined,
  tdeeEstimate: number,
): number {
  if (previousDisplayedTargetKcal === undefined) {
    return rawTargetKcal;
  }
  const maxDelta = Math.min(0.1 * tdeeEstimate, 150);
  const delta = rawTargetKcal - previousDisplayedTargetKcal;
  const cappedDelta = Math.max(-maxDelta, Math.min(maxDelta, delta));
  return previousDisplayedTargetKcal + cappedDelta;
}

/**
 * §8.3, new in v2 — minimum calorie floor. Spec is explicit that the exact absolute
 * numbers are "a reasonable placeholder... requiring product/clinical sign-off before
 * shipping", not authoritative clinical guidance. Kept as named constants so they're
 * easy to find and change, not buried in arithmetic.
 */
export const ABSOLUTE_FLOOR_KCAL: Record<'male' | 'female', number> = {
  male: 1500,
  female: 1200,
};
export const BMR_FLOOR_MULTIPLIER = 1.2;
export const LOW_BMI_FLAG_THRESHOLD = 18.5;

export interface FloorResult {
  flooredTargetKcal: number;
  floorApplied: boolean;
  floorValue: number;
}

export function applyCalorieFloor(
  targetKcal: number,
  sex: 'male' | 'female',
  currentBmrEstimate: number,
): FloorResult {
  const floorValue = Math.max(ABSOLUTE_FLOOR_KCAL[sex], BMR_FLOOR_MULTIPLIER * currentBmrEstimate);
  const flooredTargetKcal = Math.max(targetKcal, floorValue);
  return { flooredTargetKcal, floorApplied: flooredTargetKcal > targetKcal, floorValue };
}

export function computeBmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

/** §8.3 — "a mandatory flag — not a silent floor — for any user with BMI < 18.5 before
 * a deficit is recommended at all." */
export const LOW_BMI_FLAG = 'low_bmi_deficit_caution';
export const CALORIE_FLOOR_FLAG = 'calorie_floor_applied';

/**
 * Splits kcal target into macros. Not specified numerically by either source document —
 * both treat `Macros` as the Engine's output shape but don't give a macro-split formula.
 * ENGINEERING DEFAULT: protein prioritized on a per-kg-bodyweight basis (a common,
 * defensible approach for a body-recomposition-focused tool — high enough to support
 * muscle retention in a deficit per general sports-nutrition practice), fat given a
 * physiological-minimum floor, carbs fill the remainder. Flagged here the same way the
 * source spec flags its own undocumented engineering choices, since this one is mine,
 * not the spec's.
 */
export function splitMacros(
  targetKcal: number,
  bodyWeightKg: number,
): { kcal: number; proteinG: number; fatG: number; carbG: number } {
  const proteinG = Math.round(Math.min(2.2, Math.max(1.6, 2.0)) * bodyWeightKg);
  const proteinKcal = proteinG * 4;
  const fatG = Math.round(Math.max(0.5 * bodyWeightKg, (targetKcal * 0.2) / 9));
  const fatKcal = fatG * 9;
  const remainingKcal = Math.max(targetKcal - proteinKcal - fatKcal, 0);
  const carbG = Math.round(remainingKcal / 4);
  return { kcal: Math.round(targetKcal), proteinG, fatG, carbG };
}
