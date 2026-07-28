import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { upsertWeighInForDate } from './weighIns';

afterEach(async () => {
  await db.weighIns.clear();
});

describe('upsertWeighInForDate', () => {
  it('creates a new WeighIn when none exists for that date', async () => {
    const w = await upsertWeighInForDate('2026-07-10', 70.5);
    expect(w.date).toBe('2026-07-10');
    expect(w.weightKg).toBe(70.5);
    expect(await db.weighIns.count()).toBe(1);
  });

  it('updates the same row (same id, no duplicate) when called again for the same date', async () => {
    const first = await upsertWeighInForDate('2026-07-10', 70.5);
    const second = await upsertWeighInForDate('2026-07-10', 70.2);

    expect(second.id).toBe(first.id);
    expect(await db.weighIns.count()).toBe(1);
    const stored = await db.weighIns.get(first.id);
    expect(stored?.weightKg).toBe(70.2);
  });

  it('creates a separate row for a different date', async () => {
    await upsertWeighInForDate('2026-07-10', 70.5);
    await upsertWeighInForDate('2026-07-11', 70.3);
    expect(await db.weighIns.count()).toBe(2);
  });

  it('carries an optional note through', async () => {
    const w = await upsertWeighInForDate('2026-07-10', 70.5, 'after workout');
    expect(w.note).toBe('after workout');
  });
});
