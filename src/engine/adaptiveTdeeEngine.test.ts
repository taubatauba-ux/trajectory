import { describe, it, expect } from 'vitest';
import { runAdaptiveTdeeEngine } from './adaptiveTdeeEngine';
import { callEngine } from './callEngine';
import type { EngineRequest } from './engine.types';
import type { UserProfile, WeighIn } from '../types/profile';

// Deterministic PRNG (mulberry32) + Box-Muller, so this test is reproducible in CI
// without depending on Math.random(). We do NOT have the spec's own random seed (§10
// doesn't publish one), so this test checks *convergence behavior* — "does the estimate
// end up close to the true TDEE after ~45 days of noisy data", matching §10's own
// qualitative claims ("within 50-100 kcal by day 25-30") — rather than trying to
// reproduce its exact numbers, which kalmanFilter.test.ts already does via a different,
// exact method (reconstructing z_t from the spec's own stated y_t).
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number, mean: number, sd: number): number {
  const u1 = Math.max(rng(), 1e-9);
  const u2 = rng();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + sd * z0;
}

function buildProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'test-user',
    sex: 'male',
    dateOfBirth: '1994-01-15',
    heightCm: 178,
    goal: { type: 'cut' },
    measurements: {},
    activityNote: 'gym 4 days a week, otherwise desk job',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Adaptive TDEE Engine — statistical convergence over a longer horizon', () => {
  it('converges to within ~120 kcal of the true TDEE by day 45 under realistic noise', () => {
    const TRUE_TDEE = 3300; // matches adaptive-tdee-engine-spec-v2.md §10
    const LOGGED_INTAKE = 2900;
    const RHO = 7700;
    const rng = mulberry32(42);

    const startDate = new Date('2026-01-01T00:00:00Z');
    const weighIns: WeighIn[] = [];
    const dailyLogs: EngineRequest['history']['dailyLogs'] = [];

    let trueWeight = 90; // starting weight, kg
    const days = 45;
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setUTCDate(date.getUTCDate() + i);
      const dateStr = date.toISOString().slice(0, 10);

      // True physiological weight change (deterministic energy balance) plus
      // observation noise at the point of logging (§5.3's rationale).
      if (i > 0) {
        trueWeight += (LOGGED_INTAKE - TRUE_TDEE) / RHO;
      }
      const observedWeight = gaussian(rng, trueWeight, 0.35);

      weighIns.push({ id: `w${i}`, date: dateStr, weightKg: Math.round(observedWeight * 100) / 100 });
      dailyLogs.push({
        date: dateStr,
        totals: { kcal: LOGGED_INTAKE, proteinG: 180, fatG: 80, carbG: 250 },
      });
    }

    const req: EngineRequest = {
      profile: buildProfile(),
      history: { weighIns, dailyLogs },
    };

    const { response, debug } = runAdaptiveTdeeEngine(req, {
      asOf: new Date(weighIns[weighIns.length - 1]!.date + 'T12:00:00Z'),
    });

    const finalEstimate = debug.replay[debug.replay.length - 1]!.state.TDEE;
    expect(Math.abs(finalEstimate - TRUE_TDEE)).toBeLessThan(120);

    // Should NOT still be flagged low-confidence after 45 days of consistent data.
    expect(response.flags).not.toContain('insufficient_data');

    // Sanity: the estimate should have moved substantially toward the truth from the
    // (deliberately wrong, per §10) cold-start prior, not just sat near TDEE0.
    const initialEstimate = debug.tdee0;
    expect(Math.abs(finalEstimate - TRUE_TDEE)).toBeLessThan(Math.abs(initialEstimate - TRUE_TDEE));
  });
});

describe('Adaptive TDEE Engine — orchestration edge cases', () => {
  it('produces a usable response from onboarding data alone (single day, no logs)', () => {
    const req: EngineRequest = {
      profile: buildProfile({ goal: { type: 'cut' } }),
      history: {
        weighIns: [{ id: 'w0', date: '2026-06-01', weightKg: 90 }],
        dailyLogs: [],
      },
    };
    const { response } = runAdaptiveTdeeEngine(req, { asOf: new Date('2026-06-01T12:00:00Z') });
    expect(response.targets.kcal).toBeGreaterThan(1200);
    expect(response.flags).toContain('insufficient_data');
    expect(response.nextCheckIn).not.toBeNull();
  });

  it('applies the calorie floor and flags it when a cut would otherwise go below the safe minimum', () => {
    // Very light, short person with an aggressive cut — TDEE itself is low, so
    // (TDEE - 500/week equivalent) should hit the floor.
    const req: EngineRequest = {
      profile: buildProfile({
        sex: 'female',
        heightCm: 150,
        goal: { type: 'cut' },
      }),
      history: {
        weighIns: Array.from({ length: 10 }, (_, i) => ({
          id: `w${i}`,
          date: `2026-01-${String(i + 1).padStart(2, '0')}`,
          weightKg: 48,
        })),
        dailyLogs: [],
      },
    };
    const { response } = runAdaptiveTdeeEngine(req, { asOf: new Date('2026-01-10T12:00:00Z') });
    expect(response.targets.kcal).toBeGreaterThanOrEqual(1200);
    expect(response.flags).toContain('calorie_floor_applied');
  });

  it('dynamic ρ_eff mode engages when body-fat % is supplied, without a separate toggle', () => {
    const reqDynamic: EngineRequest = {
      profile: buildProfile({ measurements: { bodyFatPercent: 18 } }),
      history: {
        weighIns: [{ id: 'w0', date: '2026-06-01', weightKg: 90 }],
        dailyLogs: [],
      },
    };
    const { debug } = runAdaptiveTdeeEngine(reqDynamic, { asOf: new Date('2026-06-01T12:00:00Z') });
    expect(debug.rhoMode).toBe('dynamic');

    const reqFixed: EngineRequest = {
      profile: buildProfile({ measurements: {} }),
      history: {
        weighIns: [{ id: 'w0', date: '2026-06-01', weightKg: 90 }],
        dailyLogs: [],
      },
    };
    const { debug: debugFixed } = runAdaptiveTdeeEngine(reqFixed, {
      asOf: new Date('2026-06-01T12:00:00Z'),
    });
    expect(debugFixed.rhoMode).toBe('fixed');
    expect(debugFixed.rhoEff).toBe(7700);
  });

  it('derives the population profile from UserProfile.pharmacologicallyAssisted (Part 6) rather than always defaulting to general', () => {
    const req: EngineRequest = {
      profile: buildProfile({ pharmacologicallyAssisted: true }),
      history: {
        weighIns: [{ id: 'w0', date: '2026-06-01', weightKg: 90 }],
        dailyLogs: [],
      },
    };
    const { response } = runAdaptiveTdeeEngine(req, { asOf: new Date('2026-06-01T12:00:00Z') });
    expect(response.flags).toContain('pharmacologically_assisted_profile_active');

    // undefined (every profile created before this field existed, or anyone who
    // hasn't set it) still resolves to 'general' — additive only, matching the
    // pregnancy field's own precedent.
    const reqUnset: EngineRequest = {
      profile: buildProfile(),
      history: { weighIns: [{ id: 'w0', date: '2026-06-01', weightKg: 90 }], dailyLogs: [] },
    };
    const { response: responseUnset } = runAdaptiveTdeeEngine(reqUnset, {
      asOf: new Date('2026-06-01T12:00:00Z'),
    });
    expect(responseUnset.flags).not.toContain('pharmacologically_assisted_profile_active');

    // an explicit options.populationProfile still wins over the profile field, for
    // anyone (e.g. a future Settings "preview" affordance, or another test) who wants
    // to force one without round-tripping through a full UserProfile.
    const { response: responseOverride } = runAdaptiveTdeeEngine(reqUnset, {
      asOf: new Date('2026-06-01T12:00:00Z'),
      populationProfile: 'pharmacologically_assisted',
    });
    expect(responseOverride.flags).toContain('pharmacologically_assisted_profile_active');
  });
});

describe('callEngine — the stable one-function seam', () => {
  it('returns a real-engine response for a normal request', async () => {
    const req: EngineRequest = {
      profile: buildProfile(),
      history: {
        weighIns: [{ id: 'w0', date: '2026-06-01', weightKg: 90 }],
        dailyLogs: [],
      },
    };
    const res = await callEngine(req);
    expect(res.flags).not.toContain('engine_fallback_to_stub');
    expect(res.targets.kcal).toBeGreaterThan(0);
  });

  it('falls back to stubEngine without throwing when the real engine cannot run', async () => {
    const req: EngineRequest = {
      profile: buildProfile(),
      history: { weighIns: [], dailyLogs: [] }, // violates the "≥1 weigh-in" precondition
    };
    const res = await callEngine(req);
    expect(res.flags).toContain('engine_fallback_to_stub');
    expect(res.flags).toContain('stub_engine');
    expect(res.targets.kcal).toBeGreaterThan(0);
  });
});
