// Module B — Effective Caloric Density (ρ_eff). Source of truth:
// adaptive-tdee-engine-spec-v2.md §4.

// §4.3 — commonly cited pairing used to reconcile the Forbes partition ratio with the
// classic composition rules [14]. Spec §4.3 explicitly flags these as calibratable, not
// settled physical constants (an alternate pairing, 955.384 / 7165, exists per [4]).
export const RHO_FFM_KCAL_PER_KG = 1020;
export const RHO_FM_KCAL_PER_KG = 9500;

// §4.2's Forbes constant.
const FORBES_K = 10.4;

// §4.4 — the classic Wishnofsky-equivalent constant, used in fixed mode.
export const RHO_EFF_FIXED = 7700;

/**
 * §4.2, caveat 3 / §11: "the Forbes model has a range of positive fat mass that yields
 * negative FFM values" [21] — FFM = 14.2 + 10.4·ln(FM) is physiologically impossible
 * below a certain FM. The spec calls for clamping FM to "a validated minimum" but does
 * not pin down an exact number itself (§4.2 flags this as an implementation
 * requirement, new in v2, without supplying the constant).
 *
 * ENGINEERING DEFAULT, not a citation — same category as §3.3/§5.6's labeled defaults.
 * We clamp FM to a floor derived from approximate essential-fat percentages reported in
 * sports-medicine literature (~5% for men, ~12% for women) applied to the person's own
 * current weight, rather than a fixed absolute kg figure, so the floor scales with body
 * size instead of being wrong in one direction for very small or very large people.
 * This needs the same "requires product/clinical sign-off before shipping" caveat the
 * spec attaches to §8.3's calorie floor — it is a safety clamp, not a validated
 * physiological constant.
 */
export const ESSENTIAL_FAT_PERCENT: Record<'male' | 'female', number> = {
  male: 5,
  female: 12,
};

export function minimumFatMassKg(sex: 'male' | 'female', currentWeightKg: number): number {
  const floor = currentWeightKg * (ESSENTIAL_FAT_PERCENT[sex] / 100);
  return Math.max(floor, 2); // absolute 2kg backstop for edge-case low body weights
}

export function clampFatMass(
  fatMassKg: number,
  sex: 'male' | 'female',
  currentWeightKg: number,
): number {
  return Math.max(fatMassKg, minimumFatMassKg(sex, currentWeightKg));
}

/** §4.3 — reduces to (10,608 + 9,500·FM) / (10.4 + FM) with the default ρ_FFM/ρ_FM pair. */
export function effectiveDensityFromFatMass(
  fatMassKg: number,
  rhoFfm: number = RHO_FFM_KCAL_PER_KG,
  rhoFm: number = RHO_FM_KCAL_PER_KG,
): number {
  const fm = Math.max(fatMassKg, 0.001); // guard div-by-zero; real floor applied by caller
  return rhoFfm * (FORBES_K / (FORBES_K + fm)) + rhoFm * (fm / (FORBES_K + fm));
}

export interface EffectiveDensityResult {
  rhoEff: number;
  mode: 'fixed' | 'dynamic';
  fatMassKg?: number;
}

/**
 * §4.4, v2 trigger logic: dynamic mode starts from day one the moment LBM or body-fat %
 * was supplied to Module A — no separate body-fat entry required (fixes the v1
 * inconsistency described in §4.4's opening paragraph). Fixed mode (7,700 kcal/kg) is
 * reserved for the genuine no-composition-data case.
 */
export function computeEffectiveDensity(
  currentWeightKg: number,
  sex: 'male' | 'female',
  lbmKg: number | undefined,
): EffectiveDensityResult {
  if (lbmKg === undefined) {
    return { rhoEff: RHO_EFF_FIXED, mode: 'fixed' };
  }
  const rawFatMass = currentWeightKg - lbmKg;
  const fatMassKg = clampFatMass(rawFatMass, sex, currentWeightKg);
  return { rhoEff: effectiveDensityFromFatMass(fatMassKg), mode: 'dynamic', fatMassKg };
}
