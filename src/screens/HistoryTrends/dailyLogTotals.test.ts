// fake-indexeddb polyfills the global `indexedDB`/`IDBKeyRange` that Dexie needs. It
// MUST be imported before anything that transitively imports data/db.ts, since db.ts
// instantiates the Dexie singleton at module-load time. This is fake-indexeddb's own
// documented usage pattern (the /auto entrypoint is a side-effect-only import) — no
// vitest.config.ts changes needed, this is exactly what the existing devDependency
// (added in Part 1, unused until now) is for.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import type { LogEntry } from '../../types';
import { sumMacros, computeDailyTotals, getAllDailyTotals } from './dailyLogTotals';
import { db } from '../../data/db';

describe('sumMacros', () => {
  it('sums required fields, defaulting an empty list to all zeros', () => {
    expect(sumMacros([])).toEqual({ kcal: 0, proteinG: 0, fatG: 0, carbG: 0 });
  });

  it('sums required fields across multiple entries', () => {
    const total = sumMacros([
      { kcal: 200, proteinG: 10, fatG: 5, carbG: 20 },
      { kcal: 150, proteinG: 8, fatG: 3, carbG: 15 },
    ]);
    expect(total.kcal).toBe(350);
    expect(total.proteinG).toBe(18);
    expect(total.fatG).toBe(8);
    expect(total.carbG).toBe(35);
  });

  it('sums an optional field only across entries that defined it, and omits it entirely if none did', () => {
    const total = sumMacros([
      { kcal: 100, proteinG: 5, fatG: 2, carbG: 10, fiberG: 3 },
      { kcal: 100, proteinG: 5, fatG: 2, carbG: 10 }, // no fiberG data for this food
      { kcal: 100, proteinG: 5, fatG: 2, carbG: 10, fiberG: 1 },
    ]);
    expect(total.fiberG).toBe(4); // only the two that had it, not defaulted-to-zero for the third
    expect(total.sugarG).toBeUndefined(); // never present anywhere → stays absent, not 0
  });
});

describe('computeDailyTotals', () => {
  const entry = (date: string, kcal: number, loggedAt = `${date}T12:00:00Z`): LogEntry => ({
    id: `${date}-${kcal}-${Math.random()}`,
    date,
    loggedAt,
    foodItemId: 'food-1',
    grams: 100,
    macrosAtLogTime: { kcal, proteinG: kcal / 20, fatG: kcal / 30, carbG: kcal / 10 },
  });

  it('groups by date and sums within each group', () => {
    const totals = computeDailyTotals([
      entry('2026-07-01', 300),
      entry('2026-07-01', 200),
      entry('2026-07-02', 500),
    ]);
    expect(totals.get('2026-07-01')?.kcal).toBe(500);
    expect(totals.get('2026-07-02')?.kcal).toBe(500);
    expect(totals.size).toBe(2);
  });

  it('normalizes datetime-stamped dates to date-only keys', () => {
    // LogEntry.date is documented as date-only, but normalizing defensively costs
    // nothing and protects against any future producer that passes a full timestamp.
    const totals = computeDailyTotals([entry('2026-07-01T00:00:00Z' as string, 100)]);
    expect(totals.has('2026-07-01')).toBe(true);
  });

  it('returns an empty map for no entries', () => {
    expect(computeDailyTotals([]).size).toBe(0);
  });
});

describe('getAllDailyTotals (Dexie-backed)', () => {
  beforeEach(async () => {
    // Each test starts from a clean logEntries table — the `db` singleton persists
    // across tests within this file (module-level `export const db`), so without this
    // the second test would see the first test's rows too.
    await db.logEntries.clear();
  });

  it('aggregates whatever is currently in logEntries, across the full table', async () => {
    await db.logEntries.bulkAdd([
      {
        id: 'e1', date: '2026-07-01', loggedAt: '2026-07-01T08:00:00Z',
        foodItemId: 'f1', grams: 150,
        macrosAtLogTime: { kcal: 250, proteinG: 12, fatG: 6, carbG: 30 },
      },
      {
        id: 'e2', date: '2026-07-01', loggedAt: '2026-07-01T19:00:00Z',
        foodItemId: 'f2', grams: 200,
        macrosAtLogTime: { kcal: 400, proteinG: 20, fatG: 10, carbG: 50 },
      },
      {
        id: 'e3', date: '2026-07-03', loggedAt: '2026-07-03T08:00:00Z',
        foodItemId: 'f1', grams: 100,
        macrosAtLogTime: { kcal: 250, proteinG: 12, fatG: 6, carbG: 30 },
      },
    ]);

    const totals = await getAllDailyTotals();
    expect(totals.get('2026-07-01')?.kcal).toBe(650);
    expect(totals.get('2026-07-01')?.proteinG).toBe(32);
    expect(totals.has('2026-07-02')).toBe(false); // no log that day — absent, not zero
    expect(totals.get('2026-07-03')?.kcal).toBe(250);
  });

  it('returns an empty map when the table is empty', async () => {
    const totals = await getAllDailyTotals();
    expect(totals.size).toBe(0);
  });
});
