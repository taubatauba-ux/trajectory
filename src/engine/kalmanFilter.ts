// Module C — Core Estimator (Kalman Filter). Source of truth:
// adaptive-tdee-engine-spec-v2.md §5. A linear Kalman filter over a two-element joint
// state [W, TDEE], updated once per day.
//
// Implemented as explicit scalar algebra rather than a generic matrix library — with
// exactly two states, the general 2x2 matrix operations from §5.2/§5.4 reduce to a
// handful of scalar expressions that are easier to read, unit test, and check against
// the spec's own worked example (§10) than a generic `matrix.multiply(F, P)` call chain
// would be. The comments below name which spec equation each line implements.
//
// This file's day-1 output was hand-verified against §10's worked example table before
// being trusted (y₁=-0.109 → K=[0.675,-31.04], W=69.960, TDEE=2644.2, SD=299.4 — see
// engine.spec.test.ts for the executable version of that same check).

export interface KalmanState {
  W: number;
  TDEE: number;
}

/** [[Pww, Pwt], [Ptw, Ptt]] — kept as a full 2x2 for clarity even though it's symmetric. */
export type Cov2 = readonly [readonly [number, number], readonly [number, number]];

// §5.2 — process noise engineering defaults.
export const DEFAULT_SIGMA_W = 0.05; // kg/day
export const DEFAULT_SIGMA_TDEE = 3; // kcal/day
// §5.3 — measurement noise, derived (not purely arbitrary) from cited free-living
// weight-fluctuation and technical-error studies [15][18].
export const DEFAULT_SIGMA_R = 0.35; // kg

export interface KalmanStepParams {
  prevState: KalmanState;
  prevCov: Cov2;
  /** Logged intake for this day, kcal. Pass `undefined` for Module E's no-log case. */
  intakeKcal: number | undefined;
  /** Weight observation for this day, kg. Pass `undefined` for Module E's no-weigh-in case. */
  weightObservationKg: number | undefined;
  rhoEff: number;
  /** Overridable for §6.1's planned_deviation flag or §9.1's pharmacologically_assisted profile. */
  sigmaW?: number;
  sigmaTdee?: number;
  sigmaR?: number;
}

export interface KalmanStepResult {
  /** x_t — posterior state after the update (or after predict-only, if no weigh-in). */
  state: KalmanState;
  /** P_t — posterior covariance. */
  cov: Cov2;
  /** x⁻_t — prior state, before the update step. Module D needs this for the gate. */
  predictedState: KalmanState;
  /** P⁻_t — prior covariance. */
  predictedCov: Cov2;
  /** y_t — innovation. Only present if a weight observation was available this step. */
  innovation?: number;
  /** S_t — innovation covariance. Module D's 3-sigma gate is |y_t| > 3·sqrt(S_t). */
  innovationCovariance?: number;
  /** K_t as [K_W, K_TDEE]. */
  kalmanGain?: readonly [number, number];
  /** false when this was a predict-only step (Module E, missing weight day). */
  didUpdate: boolean;
}

/**
 * Runs one day of the predict/update recursion (§5.4). Module E's missing-data rules
 * (§7) are handled here via the `undefined` inputs:
 *  - No weight observation → predict only, uncertainty grows, state carries forward.
 *  - No logged intake → substitute the current TDEE estimate as a neutral placeholder
 *    ("assume maintenance for that day only"), which makes the predicted weight change
 *    zero in expectation.
 */
export function kalmanStep(params: KalmanStepParams): KalmanStepResult {
  const { prevState, prevCov, rhoEff } = params;
  const sigmaW = params.sigmaW ?? DEFAULT_SIGMA_W;
  const sigmaTdee = params.sigmaTdee ?? DEFAULT_SIGMA_TDEE;
  const sigmaR = params.sigmaR ?? DEFAULT_SIGMA_R;

  const intake = params.intakeKcal ?? prevState.TDEE; // §7, missing-intake substitution

  // ---- PREDICT (§5.2, §5.4) ----
  // x⁻ = F·x_{t-1} + B·I_t, with F = [[1,-1/ρ],[0,1]], B = [1/ρ, 0]
  const invRho = 1 / rhoEff;
  const predictedW = prevState.W - invRho * prevState.TDEE + invRho * intake;
  const predictedTDEE = prevState.TDEE;
  const predictedState: KalmanState = { W: predictedW, TDEE: predictedTDEE };

  // P⁻ = F·P·Fᵀ + Q — expanded by hand for a 2x2 F of this specific shape.
  const [[Pww, Pwt], [Ptw, Ptt]] = prevCov;
  const FP00 = Pww - invRho * Ptw;
  const FP01 = Pwt - invRho * Ptt;
  const FP10 = Ptw;
  const FP11 = Ptt;
  const P00 = FP00 - invRho * FP01 + sigmaW * sigmaW;
  const P01 = FP01;
  const P10 = FP10 - invRho * FP11;
  const P11 = FP11 + sigmaTdee * sigmaTdee;
  const predictedCov: Cov2 = [
    [P00, P01],
    [P10, P11],
  ];

  // ---- UPDATE (§5.4) — only if a weight observation exists this step ----
  if (params.weightObservationKg === undefined) {
    return {
      state: predictedState,
      cov: predictedCov,
      predictedState,
      predictedCov,
      didUpdate: false,
    };
  }

  const z = params.weightObservationKg;
  const R = sigmaR * sigmaR;
  const y = z - predictedW; // H = [1, 0], so H·x⁻ = predictedW
  const S = P00 + R; // H·P⁻·Hᵀ + R = P⁻_ww + R
  const K_W = P00 / S;
  const K_TDEE = P10 / S;

  const state: KalmanState = {
    W: predictedW + K_W * y,
    TDEE: predictedTDEE + K_TDEE * y,
  };

  // P = (I - K·H)·P⁻, expanded for H=[1,0] (K·H is an outer product with H's only
  // nonzero entry in column 0).
  const cov: Cov2 = [
    [(1 - K_W) * P00, (1 - K_W) * P01],
    [P10 - K_TDEE * P00, P11 - K_TDEE * P01],
  ];

  return {
    state,
    cov,
    predictedState,
    predictedCov,
    innovation: y,
    innovationCovariance: S,
    kalmanGain: [K_W, K_TDEE] as const,
    didUpdate: true,
  };
}

export function sdTdee(cov: Cov2): number {
  return Math.sqrt(Math.max(cov[1][1], 0));
}

export function sdWeight(cov: Cov2): number {
  return Math.sqrt(Math.max(cov[0][0], 0));
}
