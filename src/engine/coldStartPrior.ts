// Module A — Cold-Start TDEE Prior. Source of truth: adaptive-tdee-engine-spec-v2.md §3.
// Produces an initial TDEE₀ estimate and its uncertainty σ₀ before any weight-trend data
// exists. Runs once, at setup (§2).

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very' | 'extra';

// §3.2 — standard WHO/FAO/UNU Physical Activity Level (PAL) framework.
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
};

// §3.3 — engineering defaults, not citations. Wide enough that a ~700 kcal cold-start
// miss (the real, published MacroFactor co-creator example the spec cites) still gets
// overridden by real data within a few weeks.
export const SIGMA0_TDEE = 300; // kcal/day
export const SIGMA0_W = 0.5; // kg
export const P0_TDEE = SIGMA0_TDEE * SIGMA0_TDEE; // 90,000
export const P0_W = SIGMA0_W * SIGMA0_W; // 0.25

/**
 * §4.1's measurements convention: the trajectory app's UserProfile.measurements is
 * deliberately open-ended ("exact keys are the Engine's business, not the UI's" —
 * trajectory-app-technical-specification.md §4.1). These are the two keys this Engine
 * looks for. If neither is present, Module A falls back to Mifflin-St Jeor and Module B
 * (effectiveDensity.ts) falls back to fixed-mode ρ_eff, per §4.4.
 */
export const MEASUREMENT_KEYS = {
  leanBodyMassKg: 'leanBodyMassKg',
  bodyFatPercent: 'bodyFatPercent',
} as const;

export interface ColdStartInput {
  sex: 'male' | 'female';
  ageYears: number;
  heightCm: number;
  weightKg: number;
  measurements: Record<string, number>;
  activityLevel: ActivityLevel;
}

export interface ColdStartResult {
  tdee0: number;
  bmr: number;
  /** Which equation Module A actually used — surfaced for logging/debugging/tests. */
  bmrEquation: 'cunningham' | 'mifflin-st-jeor';
  /** LBM in kg if it was known or derivable, else undefined. */
  lbmKg?: number;
  sigma0TDEE: typeof SIGMA0_TDEE;
  sigma0W: typeof SIGMA0_W;
}

/** Derives LBM from either an explicit LBM entry or a body-fat % + current weight. */
export function deriveLbmKg(
  weightKg: number,
  measurements: Record<string, number>,
): number | undefined {
  const explicitLbm = measurements[MEASUREMENT_KEYS.leanBodyMassKg];
  if (typeof explicitLbm === 'number' && explicitLbm > 0) {
    return explicitLbm;
  }
  const bodyFatPercent = measurements[MEASUREMENT_KEYS.bodyFatPercent];
  if (typeof bodyFatPercent === 'number' && bodyFatPercent >= 0 && bodyFatPercent < 100) {
    return weightKg * (1 - bodyFatPercent / 100);
  }
  return undefined;
}

/**
 * §3.1 decision rule: Cunningham (LBM-based) if LBM/body-fat is known, else
 * Mifflin-St Jeor as the general-population fallback.
 */
export function computeBmr(input: ColdStartInput): { bmr: number; equation: ColdStartResult['bmrEquation']; lbmKg?: number } {
  const lbmKg = deriveLbmKg(input.weightKg, input.measurements);
  if (lbmKg !== undefined) {
    // Cunningham, 1980 [5]: BMR = 500 + 22 × LBM(kg)
    return { bmr: 500 + 22 * lbmKg, equation: 'cunningham', lbmKg };
  }
  // Mifflin-St Jeor, 1990 [9]
  const bmr =
    input.sex === 'male'
      ? 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears + 5
      : 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.ageYears - 161;
  return { bmr, equation: 'mifflin-st-jeor' };
}

export function coldStartPrior(input: ColdStartInput): ColdStartResult {
  const { bmr, equation, lbmKg } = computeBmr(input);
  const tdee0 = bmr * ACTIVITY_FACTORS[input.activityLevel];
  return {
    tdee0,
    bmr,
    bmrEquation: equation,
    lbmKg,
    sigma0TDEE: SIGMA0_TDEE,
    sigma0W: SIGMA0_W,
  };
}

/**
 * §3.2's known limitation, made explicit: UserProfile only carries a free-text
 * `activityNote` (trajectory spec §9.1), not one of the five PAL buckets Module A
 * actually needs. This is a coarse keyword heuristic, not a claim of accuracy — and it
 * doesn't need to be accurate, because §3's whole point is that Module A's output is
 * low-precision by design and the estimator (Module C) is expected to move away from it
 * within weeks regardless (§3, opening paragraph; σ₀=300kcal is sized for exactly this).
 * A `null`/empty note, or no keyword match, defaults to 'moderate' as a neutral middle
 * value rather than skewing the prior toward either extreme.
 */
export function inferActivityLevel(activityNote: string | undefined): ActivityLevel {
  const note = (activityNote ?? '').toLowerCase();
  if (!note.trim()) return 'moderate';

  const has = (...words: string[]) => words.some((w) => note.includes(w));

  if (has('extra active', 'physical job', 'manual labor', 'twice a day', '2x a day', 'athlete')) {
    return 'extra';
  }
  if (has('very active', '6 days', '7 days', 'daily exercise', 'train every day', 'everyday')) {
    return 'very';
  }
  if (
    has(
      'sedentary',
      'desk job',
      'no exercise',
      "don't exercise",
      'not active',
      'inactive',
      'mostly sit',
    )
  ) {
    return 'sedentary';
  }
  if (
    has(
      '3-5',
      '3 to 5',
      '3–5',
      'moderately active',
      'gym 4',
      'gym 3',
      '4 days a week',
      '4x a week',
    )
  ) {
    return 'moderate';
  }
  if (has('1-3', '1 to 3', 'lightly active', 'occasional', 'walk sometimes', '1-2 days')) {
    return 'light';
  }
  return 'moderate';
}
