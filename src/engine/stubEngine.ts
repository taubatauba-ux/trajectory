// STUB ENGINE — per trajectory-app-technical-specification.md §1.3:
// "Ship a stubEngine() using a static Mifflin-St Jeor + activity multiplier calculation,
// clearly commented as throwaway, so every screen in this spec is fully clickable and
// demoable before the real Engine exists."
//
// The real Engine now exists (see adaptiveTdeeEngine.ts, implementing
// adaptive-tdee-engine-spec-v2.md) and is what callEngine.ts calls by default. This stub
// is kept for three reasons, all deliberate, not leftover scaffolding:
//   1. It's the defensive fallback callEngine.ts uses if the real engine throws.
//   2. It's a useful "what would a naive calculator say" comparison for tests.
//   3. It has genuinely zero state — no Kalman filter, no history required — which is
//      handy for UI work on screens that don't care about targeting accuracy.
//
// This file must NEVER grow trend-smoothing, back-calculation, or adjustment logic. If
// it starts accumulating that, the logic belongs in adaptiveTdeeEngine.ts instead.
import type { EngineRequest, EngineResponse } from './engine.types';

const ACTIVITY_FACTOR_FALLBACK = 1.375; // "lightly active" — a middle-of-the-road guess
// used only because the stub has no activity-level field to read from (the real
// UserProfile only carries free-text `activityNote`, which the stub deliberately does
// not attempt to parse — that's the real Engine's job, not a regex in a throwaway stub).

function ageInYears(dateOfBirth: string, asOf: Date): number {
  const dob = new Date(dateOfBirth);
  let age = asOf.getFullYear() - dob.getFullYear();
  const hadBirthdayThisYear =
    asOf.getMonth() > dob.getMonth() ||
    (asOf.getMonth() === dob.getMonth() && asOf.getDate() >= dob.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

export function stubEngine(req: EngineRequest): EngineResponse {
  const { profile, history } = req;
  const latestWeighIn = history.weighIns.at(-1);
  const weightKg = latestWeighIn?.weightKg ?? 70; // last-resort default if profile has
  // no weigh-in yet at all — should not happen in practice since onboarding (§9.1)
  // always records a current weight before the first callEngine() call.

  const age = ageInYears(profile.dateOfBirth, new Date());

  // Mifflin-St Jeor (1990) — see adaptive-tdee-engine-spec-v2.md §3.1 for the citation
  // and the fuller discussion of when this equation is and isn't the best choice. The
  // stub doesn't implement the Cunningham/LBM branch on purpose — that nuance belongs to
  // the real Engine.
  const bmr =
    profile.sex === 'male'
      ? 10 * weightKg + 6.25 * profile.heightCm - 5 * age + 5
      : 10 * weightKg + 6.25 * profile.heightCm - 5 * age - 161;

  const tdee = bmr * ACTIVITY_FACTOR_FALLBACK;

  // Simple goal-based offset — no rate limiting, no calorie floor. This is intentionally
  // cruder than Module F (§8) of the real engine.
  const kcalOffset = profile.goal.type === 'cut' ? -500 : profile.goal.type === 'bulk' ? 300 : 0;
  const kcal = Math.max(1200, tdee + kcalOffset);

  return {
    targets: {
      kcal: Math.round(kcal),
      proteinG: Math.round((kcal * 0.3) / 4),
      fatG: Math.round((kcal * 0.3) / 9),
      carbG: Math.round((kcal * 0.4) / 4),
    },
    effectiveFrom: new Date().toISOString().slice(0, 10),
    nextCheckIn: null,
    note: 'Estimated with a static formula (stub Engine) — not the adaptive Kalman-filter Engine.',
    flags: ['stub_engine'],
  };
}
