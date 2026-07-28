import { describe, it, expect } from 'vitest';
import { buildEngineRequest } from './buildEngineRequest';
import type { UserProfile, WeighIn, LogEntry } from '../types';

const profile: UserProfile = {
  id: 'p1',
  sex: 'female',
  dateOfBirth: '1995-01-01',
  heightCm: 165,
  goal: { type: 'cut', targetWeightKg: 60 },
  measurements: {},
  createdAt: '2026-06-01T00:00:00',
  updatedAt: '2026-06-01T00:00:00',
};

const weighIns: WeighIn[] = [
  { id: 'w1', date: '2026-07-12', weightKg: 65.2 },
  { id: 'w2', date: '2026-07-13', weightKg: 65.0 },
  { id: 'w3', date: '2026-07-14', weightKg: 64.9 },
];

function entry(id: string, date: string, kcal: number): LogEntry {
  return {
    id,
    date,
    loggedAt: `${date}T08:00:00`,
    foodItemId: 'food-1',
    grams: 100,
    macrosAtLogTime: { kcal, proteinG: kcal / 20, fatG: kcal / 30, carbG: kcal / 10 },
  };
}

const ASOF = new Date('2026-07-14T20:00:00Z'); // "today" = 2026-07-14

describe('buildEngineRequest', () => {
  it('passes the profile through untouched', () => {
    const req = buildEngineRequest(profile, weighIns, [], ASOF);
    expect(req.profile).toBe(profile);
  });

  it('passes weigh-ins through untouched, including a same-day one', () => {
    const req = buildEngineRequest(profile, weighIns, [], ASOF);
    expect(req.history.weighIns).toEqual(weighIns);
  });

  it('excludes today from dailyLogs even when today has entries', () => {
    const logEntries = [
      entry('1', '2026-07-12', 300),
      entry('2', '2026-07-13', 500),
      entry('3', '2026-07-14', 200), // today — must not appear
    ];
    const req = buildEngineRequest(profile, weighIns, logEntries, ASOF);
    const dates = req.history.dailyLogs.map((d) => d.date);
    expect(dates).not.toContain('2026-07-14');
    expect(dates.sort()).toEqual(['2026-07-12', '2026-07-13']);
  });

  it('aggregates multiple entries on the same completed day into one total', () => {
    const logEntries = [
      entry('1', '2026-07-12', 300),
      entry('2', '2026-07-12', 150),
      entry('3', '2026-07-12', 50),
    ];
    const req = buildEngineRequest(profile, weighIns, logEntries, ASOF);
    expect(req.history.dailyLogs).toHaveLength(1);
    const totals = req.history.dailyLogs[0]?.totals;
    // kcal/proteinG are exact (all inputs are multiples of 20); fatG involves a
    // repeating decimal (50/30) at these fixture values, so use toBeCloseTo for it.
    expect(totals?.kcal).toBe(500);
    expect(totals?.proteinG).toBe(25);
    expect(totals?.fatG).toBeCloseTo(16.6667, 3);
    expect(totals?.carbG).toBe(50);
  });

  it('produces no dailyLogs when the only entries are for today', () => {
    const req = buildEngineRequest(profile, weighIns, [entry('1', '2026-07-14', 400)], ASOF);
    expect(req.history.dailyLogs).toEqual([]);
  });

  it('produces no dailyLogs for an empty log history', () => {
    const req = buildEngineRequest(profile, weighIns, [], ASOF);
    expect(req.history.dailyLogs).toEqual([]);
  });
});
