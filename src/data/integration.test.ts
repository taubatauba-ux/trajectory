// fake-indexeddb/auto MUST be the first import in this file — Dexie reads the global
// `indexedDB` at module-load time (db.ts does `export const db = new TrajectoryDB()` at
// the top level), so the polyfill has to be installed before anything imports db.ts,
// directly or transitively. Verified this import-order requirement empirically while
// building Part 3 (a throwaway script without the ordering fixed threw
// DexieError[MissingAPIError] immediately) — it's not just a style preference.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeAll } from 'vitest';
import { db, getProfile, addFavorite, removeFavorite, isFavorited } from './db';
import { seedDemoFoodDataIfEmpty } from './seedDemoFoodData';
import { seedDemoProfileAndHistory } from './seedDemoProfile';
import { buildEngineRequest } from '../engine/buildEngineRequest';
import { callEngine } from '../engine/callEngine';
import { computeFrequentFoodItems } from '../lib/recents';

// Deliberately one continuous scenario rather than isolated unit tests — the point is
// to exercise the real seam between Dexie, the seed data, and the Engine end to end,
// the same way DashboardScreen actually uses them together. Tests below run in
// declaration order (Vitest doesn't parallelize within a describe block) and build on
// each other's state on purpose.
describe('data pipeline integration (seed data -> Dexie -> Engine)', () => {
  const NOW = new Date('2026-07-14T10:00:00.000Z');

  beforeAll(async () => {
    await seedDemoFoodDataIfEmpty();
    await seedDemoProfileAndHistory(NOW);
  });

  it('seeds a full food catalog spanning all three sources', async () => {
    const items = await db.foodItems.toArray();
    expect(items.length).toBeGreaterThan(15);
    expect(items.some((i) => i.source === 'icmr')).toBe(true);
    expect(items.some((i) => i.source === 'off')).toBe(true);
    expect(items.some((i) => i.source === 'custom')).toBe(true);
  });

  it('is idempotent — calling seedDemoFoodDataIfEmpty again does not duplicate rows', async () => {
    const before = await db.foodItems.count();
    await seedDemoFoodDataIfEmpty();
    const after = await db.foodItems.count();
    expect(after).toBe(before);
  });

  it('seeds a profile and 21 days of weigh-ins, none of them dated today', async () => {
    const profile = await getProfile();
    expect(profile).toBeDefined();
    expect(profile?.goal.type).toBe('cut');

    const weighIns = await db.weighIns.toArray();
    expect(weighIns).toHaveLength(21);
    expect(weighIns.some((w) => w.date === '2026-07-14')).toBe(false);
    expect(weighIns.some((w) => w.date === '2026-07-13')).toBe(true); // yesterday
  });

  it('seeds log entries for the past 21 days but nothing for today', async () => {
    const entries = await db.logEntries.toArray();
    expect(entries.length).toBeGreaterThan(50); // ~4 entries/day * 21 days
    expect(entries.every((e) => e.date !== '2026-07-14')).toBe(true);
  });

  it('feeds the seeded history through buildEngineRequest -> callEngine and gets a sane, converged response', async () => {
    const profile = await getProfile();
    if (!profile) throw new Error('profile should exist after beforeAll seeding');
    const weighIns = await db.weighIns.toArray();
    const logEntries = await db.logEntries.toArray();

    const request = buildEngineRequest(profile, weighIns, logEntries, NOW);
    // The one correctness property that matters most here: today never leaks into the
    // payload, even though this exact request is built from real, non-trivial seeded
    // data rather than a hand-crafted fixture.
    expect(request.history.dailyLogs.some((d) => d.date === '2026-07-14')).toBe(false);
    expect(request.history.dailyLogs.length).toBe(21);

    const response = await callEngine(request);

    expect(response.targets.kcal).toBeGreaterThan(800); // sane floor, not e.g. 0 or NaN
    expect(response.targets.kcal).toBeLessThan(4000); // sane ceiling for this profile
    expect(Number.isFinite(response.targets.proteinG)).toBe(true);
    expect(Number.isFinite(response.targets.fatG)).toBe(true);
    expect(Number.isFinite(response.targets.carbG)).toBe(true);
    expect(response.effectiveFrom).toBeTruthy();

    // 21 days of history clears MIN_DAYS_FOR_CONFIDENCE (7, adaptiveTdeeEngine.ts) — the
    // seed data's whole point is a demo that looks converged, not one flashing an
    // insufficient-data warning on first launch.
    expect(response.flags ?? []).not.toContain('insufficient_data');
    // Never using the fallback path is what confirms the real engine actually ran on
    // this data rather than silently degrading to the stub.
    expect(response.flags ?? []).not.toContain('engine_fallback_to_stub');
  });

  it('always carries the pregnancy/breastfeeding-unconfirmed flag — a known, documented data-model gap (populationProfiles.ts), not a bug introduced here', async () => {
    const profile = await getProfile();
    if (!profile) throw new Error('profile should exist');
    const request = buildEngineRequest(profile, await db.weighIns.toArray(), await db.logEntries.toArray(), NOW);
    const response = await callEngine(request);
    expect(response.flags ?? []).toContain('pregnancy_breastfeeding_status_unconfirmed');
  });

  it('supports the full favorite pin/unpin cycle against real Dexie', async () => {
    const foodId = 'demo-icmr-1';
    expect(await isFavorited(foodId)).toBe(false);

    await addFavorite(foodId, 150);
    expect(await isFavorited(foodId)).toBe(true);
    const stored = await db.favorites.where('foodItemId').equals(foodId).first();
    expect(stored?.gramsDefault).toBe(150);

    // Re-pinning updates the remembered amount in place rather than creating a duplicate.
    await addFavorite(foodId, 200);
    const afterRepin = await db.favorites.where('foodItemId').equals(foodId).toArray();
    expect(afterRepin).toHaveLength(1);
    expect(afterRepin[0]?.gramsDefault).toBe(200);

    await removeFavorite(foodId);
    expect(await isFavorited(foodId)).toBe(false);
  });

  it('ranks the seeded log history by frequency through computeFrequentFoodItems', async () => {
    const logEntries = await db.logEntries.toArray();
    const foodItems = await db.foodItems.toArray();
    const foodItemsById = new Map(foodItems.map((f) => [f.id, f]));

    const frequent = computeFrequentFoodItems(logEntries, foodItemsById, 5);
    expect(frequent.length).toBeGreaterThan(0);
    expect(frequent.length).toBeLessThanOrEqual(5);
    // Descending by count, matching §9.2's "most-logged items first".
    for (let i = 1; i < frequent.length; i++) {
      expect(frequent[i - 1]!.logCount).toBeGreaterThanOrEqual(frequent[i]!.logCount);
    }
  });
});
