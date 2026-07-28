import { describe, it, expect } from 'vitest';
import { kalmanStep, sdTdee, type KalmanState, type Cov2 } from './kalmanFilter';
import { P0_TDEE, P0_W } from './coldStartPrior';

// Reproduces adaptive-tdee-engine-spec-v2.md §10's worked example. The spec states:
// "All values below are direct output of running §5.4's exact equations, not
// hand-calculated" — and gives the exact innovation y_t for days 1-3, but not the raw
// noisy weight observations z_t themselves (those depend on a random seed the spec
// doesn't publish). Since y_t = z_t - predictedW, we can reconstruct exactly which z_t
// the spec must have used at each step and feed those in — this validates the
// implementation against the spec's own numbers rather than against a re-derivation of
// them, which is the strongest test available without the original seed.
//
// Day-1 was independently hand-derived (see kalmanFilter.ts's file header comment)
// before this test existed, so this file is confirmation, not the first check.

const RHO_FIXED = 7700;
const LOGGED_INTAKE = 2900;

describe('Module C Kalman filter — §10 worked example reproduction', () => {
  it('matches the spec exactly for days 1, 2, and 3', () => {
    // §10 setup: 70kg start, TDEE0 = 2640.81 (Mifflin-St Jeor fallback path), P0 as
    // defined in §5.5.
    let state: KalmanState = { W: 70.0, TDEE: 2640.81 };
    let cov: Cov2 = [
      [P0_W, 0],
      [0, P0_TDEE],
    ];
    expect(P0_W).toBeCloseTo(0.25, 10);
    expect(P0_TDEE).toBeCloseTo(90000, 10);

    const days = [
      { y: -0.109, W: 69.96, TDEE: 2644.2, SD: 299.4 },
      { y: 0.493, W: 70.199, TDEE: 2608.0, SD: 297.5 },
      { y: -0.429, W: 70.1, TDEE: 2656.9, SD: 293.6 },
    ];

    for (const day of days) {
      // Predict first (mirrors kalmanStep's internals) purely to back out the z_t that
      // would produce the spec's stated y_t — kalmanStep itself is called once below
      // with that reconstructed z_t, so the actual code path under test is identical to
      // every other day, not special-cased.
      const invRho = 1 / RHO_FIXED;
      const predictedW = state.W - invRho * state.TDEE + invRho * LOGGED_INTAKE;
      const impliedZ = predictedW + day.y;

      const result = kalmanStep({
        prevState: state,
        prevCov: cov,
        intakeKcal: LOGGED_INTAKE,
        weightObservationKg: impliedZ,
        rhoEff: RHO_FIXED,
      });

      expect(result.innovation).toBeCloseTo(day.y, 3);
      expect(result.state.W).toBeCloseTo(day.W, 2);
      // precision 0 (±0.5 kcal), not 1: each day's z_t is *reconstructed* from the
      // spec's 3-decimal-rounded y_t, so rounding compounds slightly across the 3-day
      // recursion — by day 3 this reconstruction method alone (not the filter) accounts
      // for ~0.06 kcal of drift. ±0.5 out of ~2650-2660 kcal (0.02%) is still a tight
      // check; days 1-2 pass at the stricter ±0.05 anyway, confirming the recursion
      // itself is exact and this is purely input-reconstruction rounding.
      expect(result.state.TDEE).toBeCloseTo(day.TDEE, 0);
      expect(sdTdee(result.cov)).toBeCloseTo(day.SD, 1);

      state = result.state;
      cov = result.cov;
    }
  });

  it('matches the spec-quoted Kalman gain for day 1 exactly ([0.675, -31.04])', () => {
    const state: KalmanState = { W: 70.0, TDEE: 2640.81 };
    const cov: Cov2 = [
      [P0_W, 0],
      [0, P0_TDEE],
    ];
    const invRho = 1 / RHO_FIXED;
    const predictedW = state.W - invRho * state.TDEE + invRho * LOGGED_INTAKE;
    const impliedZ = predictedW + -0.109;

    const result = kalmanStep({
      prevState: state,
      prevCov: cov,
      intakeKcal: LOGGED_INTAKE,
      weightObservationKg: impliedZ,
      rhoEff: RHO_FIXED,
    });

    expect(result.kalmanGain?.[0]).toBeCloseTo(0.675, 2);
    expect(result.kalmanGain?.[1]).toBeCloseTo(-31.04, 1);
  });

  it('Module E: missing weight observation predicts only, and uncertainty grows', () => {
    const state: KalmanState = { W: 70, TDEE: 2700 };
    const cov: Cov2 = [
      [0.3, 0],
      [0, 5000],
    ];
    const result = kalmanStep({
      prevState: state,
      prevCov: cov,
      intakeKcal: 2500,
      weightObservationKg: undefined,
      rhoEff: 7700,
    });
    expect(result.didUpdate).toBe(false);
    expect(result.innovation).toBeUndefined();
    // TDEE estimate itself must not move on a predict-only step (F leaves TDEE
    // unchanged, and there's no update to move it further).
    expect(result.state.TDEE).toBeCloseTo(2700, 6);
    // Uncertainty must grow (process noise added, nothing to shrink it back).
    expect(result.cov[1][1]).toBeGreaterThan(cov[1][1]);
    expect(result.cov[0][0]).toBeGreaterThan(cov[0][0]);
  });

  it('Module E: missing intake substitutes current TDEE estimate, so expected weight change is ~0', () => {
    const state: KalmanState = { W: 80, TDEE: 2600 };
    const cov: Cov2 = [
      [0.3, 0],
      [0, 5000],
    ];
    const result = kalmanStep({
      prevState: state,
      prevCov: cov,
      intakeKcal: undefined,
      weightObservationKg: undefined, // isolate the predict step's W change specifically
      rhoEff: 7700,
    });
    // predictedW = W - TDEE/rho + I/rho, with I substituted as TDEE => predictedW = W exactly.
    expect(result.predictedState.W).toBeCloseTo(80, 9);
  });
});
