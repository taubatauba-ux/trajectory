// fake-indexeddb/auto must be imported before anything that touches Dexie/indexedDB —
// it patches the global indexedDB/IDBKeyRange that db.ts's `new TrajectoryDB()` needs.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { getDailyLogsHistory, totalsForDay } from './dailyLogs';
import type { LogEntry } from '../types/logging';

function makeEntry(overrides: Partial<LogEntry> & Pick<LogEntry, 'date'>): LogEntry {
  return {
    id: crypto.randomUUID(),
    loggedAt: `${overrides.date}T12:00:00.000Z`,
    foodItemId: 'food-1',
    grams: 100,
    macrosAtLogTime: { kcal: 100, proteinG: 5, fatG: 2, carbG: 15 },
    ...overrides,
  };
}

afterEach(async () => {
  // Each test starts from a clean slate — same IndexedDB instance persists across tests
  // in one file otherwise.
  await db.logEntries.clear();
});

describe('totalsForDay', () => {
  it('sums macrosAtLogTime snapshots, not anything re-derived from the current FoodItem', () => {
    const entries = [
      makeEntry({ date: '2026-07-10', macrosAtLogTime: { kcal: 100, proteinG: 5, fatG: 2, carbG: 15 } }),
      makeEntry({ date: '2026-07-10', macrosAtLogTime: { kcal: 200, proteinG: 10, fatG: 4, carbG: 30 } }),
    ];
    expect(totalsForDay(entries)).toEqual({ kcal: 300, proteinG: 15, fatG: 6, carbG: 45 });
  });

  it('returns all-zero totals for a day with no entries', () => {
    expect(totalsForDay([])).toEqual({ kcal: 0, proteinG: 0, fatG: 0, carbG: 0 });
  });
});

describe('getDailyLogsHistory', () => {
  it('groups logEntries by date, sorted oldest first, in the shape the Engine expects', async () => {
    await db.logEntries.bulkAdd([
      makeEntry({ date: '2026-07-12', macrosAtLogTime: { kcal: 400, proteinG: 20, fatG: 10, carbG: 40 } }),
      makeEntry({ date: '2026-07-10', macrosAtLogTime: { kcal: 100, proteinG: 5, fatG: 2, carbG: 15 } }),
      makeEntry({ date: '2026-07-10', macrosAtLogTime: { kcal: 150, proteinG: 8, fatG: 3, carbG: 20 } }),
    ]);

    const history = await getDailyLogsHistory();

    expect(history.map((d) => d.date)).toEqual(['2026-07-10', '2026-07-12']);
    expect(history[0]!.totals).toEqual({ kcal: 250, proteinG: 13, fatG: 5, carbG: 35 });
    expect(history[1]!.totals).toEqual({ kcal: 400, proteinG: 20, fatG: 10, carbG: 40 });
  });

  it('returns an empty array when nothing has been logged yet', async () => {
    expect(await getDailyLogsHistory()).toEqual([]);
  });
});
