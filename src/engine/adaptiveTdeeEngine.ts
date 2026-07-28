// The Adaptive TDEE Engine — orchestrates Modules A-F from adaptive-tdee-engine-spec-v2.md
// into the single function trajectory-app-technical-specification.md §1.3 calls through
// `callEngine()`.
//
// KEY DESIGN DECISION: statelessness. EngineRequest.history carries *every* weigh-in and
// daily log on record (§1.3), not incremental deltas since last call. So rather than
// persisting Kalman filter state (x̂_t, P_t) somewhere and updating it incrementally,
// this engine replays the ENTIRE predict/update recursion from the first weigh-in
// through today on every single call. This is more compute than strictly necessary, but
// for the data volumes involved (at most a few thousand days), it's imperceptible, and
// it means the Engine has zero persisted state of its own — fully consistent with §1.2's
// framing ("the app calls it through one function and renders whatever it returns") and
// with CheckIn snapshots (§4.1) being the only place engine I/O is stored, purely for
// display history, never re-fed as an input.
//
// GAPS BRIDGED, DOCUMENTED HERE (none of these are in either source spec verbatim —
// they're the connective tissue between two documents that were deliberately written to
// not know about each other's exact data shapes):
//   1. Module A needs one of 5 discrete activity buckets; UserProfile only has free-text
//      activityNote. Bridged by coldStartPrior.ts's inferActivityLevel() heuristic.
//   2. Module A/B need LBM or body-fat %; UserProfile.measurements is an open Record.
//      Bridged by a documented key convention (coldStartPrior.ts's MEASUREMENT_KEYS).
//   3. Module F needs a desired_weekly_rate_kg; UserProfile.goal only has a categorical
//      type ('cut'/'maintain'/'bulk'). Bridged by DEFAULT_WEEKLY_RATE_KG below — the cut
//      default (-0.5 kg/week) is not arbitrary, it's the exact rate used in
//      adaptive-tdee-engine-spec-v2.md §10's own worked example.
//   4. Module F's rate limiter needs "the previously displayed target"; the stateless
//      design here means that's reconstructed by replaying the limiter day-by-day
//      alongside the filter (see `displayedTargetHistory` below) rather than being read
//      from persisted state.

import type { EngineRequest, EngineResponse } from './engine.types';
import type { Macros } from '../types/food';
import {
  coldStartPrior,
  inferActivityLevel,
  deriveLbmKg,
  P0_TDEE,
  P0_W,
} from './coldStartPrior';
import { computeEffectiveDensity } from './effectiveDensity';
import { kalmanStep, sdTdee, type KalmanState, type Cov2 } from './kalmanFilter';
import { checkOutlierGate, OUTLIER_FLAG } from './outlierGate';
import {
  computeRawTargetKcal,
  applyRateLimiter,
  applyCalorieFloor,
  computeBmi,
  splitMacros,
  LOW_BMI_FLAG,
  LOW_BMI_FLAG_THRESHOLD,
  CALORIE_FLOOR_FLAG,
} from './targetLimiter';
import {
  resolveProfileNoise,
  checkExclusions,
  type PopulationProfile,
  PHARMA_ASSISTED_FLAG,
} from './populationProfiles';

export interface AdaptiveEngineOptions {
  /** §9.1 — not part of the stable EngineRequest contract; opt-in until the UI exposes
   * a way to set it (there's no field for it in UserProfile today). */
  populationProfile?: PopulationProfile;
  /** §6.1 — ISO dates the user has pre-registered as a planned maintenance
   * break/deviation. Also not part of the stable contract yet, for the same reason. */
  plannedDeviationDates?: ReadonlySet<string>;
  /** Overrides "today" for deterministic testing. Defaults to the real current date. */
  asOf?: Date;
}

const MIN_DAYS_FOR_CONFIDENCE = 7; // §5.6: convergence expected in 14-30 days; below a
// week of data, flag low confidence rather than presenting the target as solid.
const CHECK_IN_CADENCE_DAYS = 7; // engineering default: weekly check-in cadence, chosen
// to match Module F's own "week-over-week" framing (§8.2) rather than an arbitrary
// number pulled from nowhere.

const DEFAULT_WEEKLY_RATE_KG: Record<'cut' | 'maintain' | 'bulk', number> = {
  cut: -0.5, // matches adaptive-tdee-engine-spec-v2.md §10's own worked example exactly
  maintain: 0,
  bulk: 0.25, // conservative lean-bulk default
};

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function ageInYears(dateOfBirth: string, asOf: Date): number {
  const dob = new Date(dateOfBirth);
  let age = asOf.getFullYear() - dob.getFullYear();
  const hadBirthday =
    asOf.getMonth() > dob.getMonth() ||
    (asOf.getMonth() === dob.getMonth() && asOf.getDate() >= dob.getDate());
  if (!hadBirthday) age -= 1;
  return age;
}

function enumerateDates(startISO: string, endISO: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(startISO + 'T00:00:00Z');
  const end = new Date(endISO + 'T00:00:00Z');
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export interface DailyReplayPoint {
  date: string;
  state: KalmanState;
  cov: Cov2;
  didUpdate: boolean;
  outlierFlagged: boolean;
  displayedTargetKcal: number;
}

export interface AdaptiveEngineDebugInfo {
  replay: DailyReplayPoint[];
  rhoEff: number;
  rhoMode: 'fixed' | 'dynamic';
  tdee0: number;
  bmrEquation: 'cunningham' | 'mifflin-st-jeor';
  activityLevel: string;
}

/** Exposed alongside the EngineResponse for the History/Trends screen (§9.8) — it needs
 * the full estimate-over-time series, not just today's snapshot, and this is the only
 * place that series exists (nothing else replays the filter). Not part of the stable
 * EngineRequest/EngineResponse contract; callEngine.ts re-exports it as a named export
 * so screens *may* use it without it being forced through the one-function seam that
 * contract is about preserving. */
export function runAdaptiveTdeeEngine(
  req: EngineRequest,
  options: AdaptiveEngineOptions = {},
): { response: EngineResponse; debug: AdaptiveEngineDebugInfo } {
  const { profile, history } = req;
  const asOf = options.asOf ?? new Date();
  // Part 6: falls back to the profile's own field (added to close the gap this exact
  // line used to represent — see types/profile.ts's pharmacologicallyAssisted comment)
  // rather than always defaulting to 'general'. `options.populationProfile` stays
  // available as an explicit override for anyone who wants one (tests use this).
  const profileKind: PopulationProfile =
    options.populationProfile ?? (profile.pharmacologicallyAssisted ? 'pharmacologically_assisted' : 'general');

  const sortedWeighIns = [...history.weighIns].sort((a, b) => a.date.localeCompare(b.date));
  if (sortedWeighIns.length === 0) {
    throw new Error(
      'runAdaptiveTdeeEngine requires at least one weigh-in (onboarding, §9.1, records ' +
        'one before the first callEngine() call). Falling back to stubEngine is callEngine.ts\'s job, not this function\'s.',
    );
  }

  const ageYears = ageInYears(profile.dateOfBirth, asOf);
  const activityLevel = inferActivityLevel(profile.activityNote);
  const firstWeighIn = sortedWeighIns[0]!;
  const latestWeighIn = sortedWeighIns[sortedWeighIns.length - 1]!;

  // ---- Module A ----
  const coldStart = coldStartPrior({
    sex: profile.sex,
    ageYears,
    heightCm: profile.heightCm,
    weightKg: firstWeighIn.weightKg,
    measurements: profile.measurements,
    activityLevel,
  });

  // ---- Module B ----
  // §4.4: recomputed "whenever a new body-fat estimate is entered" — this stateless
  // replay only has access to *current* profile.measurements (no historical
  // measurement series in the contract), so dynamic-mode ρ_eff is held constant across
  // the whole replay using today's LBM. Documented simplification, not an oversight.
  const lbmKg = deriveLbmKg(latestWeighIn.weightKg, profile.measurements);
  const density = computeEffectiveDensity(latestWeighIn.weightKg, profile.sex, lbmKg);

  // ---- §9 population profile / exclusions ----
  const noise = resolveProfileNoise(profileKind, 0.05, 3);
  const exclusionFlags = checkExclusions(ageYears, profile.pregnancyOrBreastfeedingStatus);

  // ---- Build the day-by-day maps ----
  const weightByDate = new Map(sortedWeighIns.map((w) => [toDateOnly(w.date), w.weightKg]));
  const intakeByDate = new Map(
    history.dailyLogs.map((d) => [toDateOnly(d.date), d.totals.kcal] as const),
  );
  const today = toDateOnly(asOf.toISOString());
  const lastDataDate = toDateOnly(latestWeighIn.date) > today ? toDateOnly(latestWeighIn.date) : today;
  const timeline = enumerateDates(toDateOnly(firstWeighIn.date), lastDataDate);

  // ---- Module C replay (+ Module D gate, + Module F displayed-target reconstruction) ----
  const weeklyRate = DEFAULT_WEEKLY_RATE_KG[profile.goal.type];
  const replay: DailyReplayPoint[] = [];
  let state: KalmanState = { W: firstWeighIn.weightKg, TDEE: coldStart.tdee0 };
  let cov: Cov2 = [
    [P0_W, 0],
    [0, P0_TDEE],
  ];
  let lastOutlierFlaggedIndex = -Infinity;

  for (let i = 0; i < timeline.length; i++) {
    const date = timeline[i]!;
    if (i > 0) {
      const isPlannedDeviation = options.plannedDeviationDates?.has(date) ?? false;
      const stepResult = kalmanStep({
        prevState: state,
        prevCov: cov,
        intakeKcal: intakeByDate.get(date),
        weightObservationKg: weightByDate.get(date),
        rhoEff: density.rhoEff,
        // §6.1: a planned deviation freezes q_t low so a scheduled maintenance week
        // isn't misread as a genuine TDEE change.
        sigmaTdee: isPlannedDeviation ? noise.sigmaTdee * 0.2 : noise.sigmaTdee,
        sigmaW: noise.sigmaW,
      });
      state = stepResult.state;
      cov = stepResult.cov;

      let outlierFlagged = false;
      if (stepResult.didUpdate && stepResult.innovation !== undefined && stepResult.innovationCovariance !== undefined) {
        const gate = checkOutlierGate(stepResult.innovation, stepResult.innovationCovariance);
        outlierFlagged = gate.flagged;
        if (outlierFlagged) lastOutlierFlaggedIndex = i;
      }

      const raw = computeRawTargetKcal(state.TDEE, weeklyRate, density.rhoEff);
      const sevenDaysAgo = replay[i - 7];
      const displayedTargetKcal = applyRateLimiter(raw, sevenDaysAgo?.displayedTargetKcal, state.TDEE);

      replay.push({ date, state, cov, didUpdate: stepResult.didUpdate, outlierFlagged, displayedTargetKcal });
    } else {
      // Day 0 — initialization only (§5.5), no predict/update.
      const raw = computeRawTargetKcal(state.TDEE, weeklyRate, density.rhoEff);
      replay.push({ date, state, cov, didUpdate: false, outlierFlagged: false, displayedTargetKcal: raw });
    }
  }

  const finalPoint = replay[replay.length - 1]!;

  // ---- Module F: floor + macro split ----
  const bmrNow = coldStart.bmrEquation === 'cunningham'
    ? 500 + 22 * (lbmKg ?? finalPoint.state.W * 0.8)
    : coldStart.bmr; // BMR itself isn't re-estimated day to day by this engine (only
  // TDEE is a Kalman state) — using the cold-start BMR as the floor reference is a
  // deliberate simplification; it under-reacts to large weight changes over a long
  // diet, which is conservative (a stale-but-higher BMR keeps the floor from drifting
  // down), not one that risks an unsafely-low floor.
  const floor = applyCalorieFloor(finalPoint.displayedTargetKcal, profile.sex, bmrNow);
  const macros: Macros = splitMacros(floor.flooredTargetKcal, finalPoint.state.W);

  // ---- flags ----
  const flags: string[] = [];
  const daysOfData = timeline.length;
  if (daysOfData < MIN_DAYS_FOR_CONFIDENCE) flags.push('insufficient_data');
  if (lastOutlierFlaggedIndex >= timeline.length - 1 - 5) flags.push(OUTLIER_FLAG); // still
  // inside the §6 5-day post-flag suppression window
  if (floor.floorApplied) flags.push(CALORIE_FLOOR_FLAG);
  if (computeBmi(finalPoint.state.W, profile.heightCm) < LOW_BMI_FLAG_THRESHOLD && weeklyRate < 0) {
    flags.push(LOW_BMI_FLAG);
  }
  if (profileKind === 'pharmacologically_assisted') flags.push(PHARMA_ASSISTED_FLAG);
  flags.push(...exclusionFlags);

  const noteParts: string[] = [];
  if (daysOfData < MIN_DAYS_FOR_CONFIDENCE) {
    noteParts.push(
      `Still calibrating — only ${daysOfData} day${daysOfData === 1 ? '' : 's'} of data so far, expect this to move.`,
    );
  } else {
    noteParts.push(`Estimate based on ${daysOfData} days of history, ±${Math.round(sdTdee(finalPoint.cov))} kcal/day.`);
  }
  if (floor.floorApplied) {
    noteParts.push('Target was raised to the minimum safe floor.');
  }

  const response: EngineResponse = {
    targets: macros,
    effectiveFrom: today,
    nextCheckIn: addDaysISO(today, CHECK_IN_CADENCE_DAYS),
    note: noteParts.join(' '),
    flags,
  };

  return {
    response,
    debug: {
      replay,
      rhoEff: density.rhoEff,
      rhoMode: density.mode,
      tdee0: coldStart.tdee0,
      bmrEquation: coldStart.bmrEquation,
      activityLevel,
    },
  };
}

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
