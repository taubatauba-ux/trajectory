// §9 Population-Specific Profiles. Source of truth: adaptive-tdee-engine-spec-v2.md §9.

export type PopulationProfile = 'general' | 'pharmacologically_assisted';

/**
 * §9.1's recommendation: wider σ_w/σ_tdee, and the 1-2-week transient-unwind assumption
 * suppressed for this profile (sustained appetite suppression is the new steady state,
 * not a transient — §9.1's core point). The spec flags these multipliers as "not yet
 * numerically tuned" (§11's parameter table) — they're a documented starting point, not
 * a validated result, exactly as flagged there. §13 step 5 calls for calibrating this
 * profile against real data before trusting it.
 */
export const PHARMA_ASSISTED_NOISE_MULTIPLIER = {
  sigmaW: 2.5,
  sigmaTdee: 2.5,
} as const;

export interface ProfileAdjustedNoise {
  sigmaW: number;
  sigmaTdee: number;
  /** §9.1: for this profile, Module D's gate still flags, but the "assume it'll unwind
   * in 1-2 weeks and suppress the display" behavior (§6) does not apply, since a large
   * sustained shift IS the expected new steady state here. */
  suppressTransientUnwindAssumption: boolean;
}

export function resolveProfileNoise(
  profile: PopulationProfile,
  baseSigmaW: number,
  baseSigmaTdee: number,
): ProfileAdjustedNoise {
  if (profile === 'pharmacologically_assisted') {
    return {
      sigmaW: baseSigmaW * PHARMA_ASSISTED_NOISE_MULTIPLIER.sigmaW,
      sigmaTdee: baseSigmaTdee * PHARMA_ASSISTED_NOISE_MULTIPLIER.sigmaTdee,
      suppressTransientUnwindAssumption: true,
    };
  }
  return { sigmaW: baseSigmaW, sigmaTdee: baseSigmaTdee, suppressTransientUnwindAssumption: false };
}

export const PHARMA_ASSISTED_FLAG = 'pharmacologically_assisted_profile_active';

// §9.2 — explicit exclusions this engine's governing equation (§1.1) already implies.
// UPDATE (Part 4): UserProfile now has `pregnancyOrBreastfeedingStatus` (see
// types/profile.ts) closing the gap described below — this function's second parameter
// is that field, threaded through from adaptiveTdeeEngine.ts. Passing `undefined`
// (the default for every profile created before this field existed, and for anyone who
// skips the onboarding question) preserves the original always-flagged behavior exactly,
// so this change is additive only: no existing caller or test changes behavior.
export const MIN_AGE_YEARS = 18;
export const UNDER_MIN_AGE_FLAG = 'under_minimum_age_exclusion';
export const PREGNANCY_EXCLUSION_UNCONFIRMED_FLAG = 'pregnancy_breastfeeding_status_unconfirmed';

export function checkExclusions(
  ageYears: number,
  pregnancyOrBreastfeedingStatus?: 'not_applicable' | 'pregnant' | 'breastfeeding',
): string[] {
  const flags: string[] = [];
  if (ageYears < MIN_AGE_YEARS) {
    flags.push(UNDER_MIN_AGE_FLAG);
  }
  // Raised whenever status is unknown (undefined) OR affirmatively pregnant/breastfeeding
  // — both are cases where the governing equation's "not pregnant or breastfeeding"
  // precondition (§9.2) isn't satisfied. Only 'not_applicable' — an explicit answer —
  // suppresses it.
  if (pregnancyOrBreastfeedingStatus !== 'not_applicable') {
    flags.push(PREGNANCY_EXCLUSION_UNCONFIRMED_FLAG);
  }
  return flags;
}
