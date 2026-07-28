import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db, getSyncMeta } from './db';
import { syncBundledFoodData } from './bundledFoodData';
import type { ICMRFoodItem, OFFFoodItem } from '../types/food';

afterEach(async () => {
  await db.foodItems.clear();
  await db.syncMeta.clear();
});

const ICMR_ITEM: ICMRFoodItem = {
  id: 'icmr-1',
  displayName: 'Rice, raw, milled',
  source: 'icmr',
  ifctCode: 'A007',
  foodGroup: 'Cereals & millets',
  per100g: { kcal: 345, proteinG: 6.8, fatG: 0.5, carbG: 78.2 },
};

const OFF_ITEM: OFFFoodItem = {
  id: 'off-1',
  displayName: 'Example Brand Muesli',
  source: 'off',
  offId: '1234567890123',
  lastSyncedAt: '2026-07-01T00:00:00Z',
  per100g: { kcal: 380, proteinG: 10, fatG: 6, carbG: 65 },
};

describe('syncBundledFoodData', () => {
  it('does nothing when neither bundle is present (the pre-pipeline state)', async () => {
    const result = await syncBundledFoodData({
      icmrItems: undefined,
      icmrMeta: undefined,
      offItems: undefined,
      offMeta: undefined,
    });
    expect(result).toEqual({ icmrLoaded: false, offLoaded: false, icmrCount: 0, offCount: 0 });
    expect(await db.foodItems.count()).toBe(0);
    expect(await getSyncMeta()).toBeUndefined();
  });

  it('loads ICMR data on first run and stamps SyncMeta with the extraction date', async () => {
    const result = await syncBundledFoodData({
      icmrItems: [ICMR_ITEM],
      icmrMeta: { extractionDate: '2026-06-01T00:00:00Z' },
      offItems: undefined,
      offMeta: undefined,
    });
    expect(result.icmrLoaded).toBe(true);
    expect(result.icmrCount).toBe(1);
    expect(await db.foodItems.get('icmr-1')).toMatchObject({ displayName: 'Rice, raw, milled' });
    expect((await getSyncMeta())?.icmrDatasetVersion).toBe('2026-06-01T00:00:00Z');
  });

  it('does not re-load ICMR data when the bundled version matches what is already stored', async () => {
    const inputs = {
      icmrItems: [ICMR_ITEM],
      icmrMeta: { extractionDate: '2026-06-01T00:00:00Z' },
      offItems: undefined,
      offMeta: undefined,
    };
    await syncBundledFoodData(inputs);
    await db.foodItems.delete('icmr-1'); // simulate the user having removed it somehow
    const second = await syncBundledFoodData(inputs);
    expect(second.icmrLoaded).toBe(false);
    // and it was NOT re-inserted, proving the version check actually short-circuited
    expect(await db.foodItems.get('icmr-1')).toBeUndefined();
  });

  it('re-loads when a newer extraction date is seen', async () => {
    await syncBundledFoodData({
      icmrItems: [ICMR_ITEM],
      icmrMeta: { extractionDate: '2026-06-01T00:00:00Z' },
      offItems: undefined,
      offMeta: undefined,
    });
    const updated: ICMRFoodItem = { ...ICMR_ITEM, displayName: 'Rice, raw, milled (revised)' };
    const result = await syncBundledFoodData({
      icmrItems: [updated],
      icmrMeta: { extractionDate: '2026-07-01T00:00:00Z' },
      offItems: undefined,
      offMeta: undefined,
    });
    expect(result.icmrLoaded).toBe(true);
    expect((await db.foodItems.get('icmr-1'))?.displayName).toBe('Rice, raw, milled (revised)');
    expect((await getSyncMeta())?.icmrDatasetVersion).toBe('2026-07-01T00:00:00Z');
  });

  it('derives offDatasetVersion from the more recent of lastDeltaAppliedDate/lastFullReimportDate, since sync_off_delta.py does not write offDatasetVersion directly', async () => {
    const result = await syncBundledFoodData({
      icmrItems: undefined,
      icmrMeta: undefined,
      offItems: [OFF_ITEM],
      offMeta: { lastDeltaAppliedDate: '2026-07-10', lastFullReimportDate: '2026-01-01' },
    });
    expect(result.offLoaded).toBe(true);
    expect((await getSyncMeta())?.offDatasetVersion).toBe('2026-07-10');
  });

  it('loads both datasets independently in a single call', async () => {
    const result = await syncBundledFoodData({
      icmrItems: [ICMR_ITEM],
      icmrMeta: { extractionDate: '2026-06-01T00:00:00Z' },
      offItems: [OFF_ITEM],
      offMeta: { lastDeltaAppliedDate: '2026-07-10', lastFullReimportDate: null },
    });
    expect(result).toEqual({ icmrLoaded: true, offLoaded: true, icmrCount: 1, offCount: 1 });
    expect(await db.foodItems.count()).toBe(2);
  });
});
