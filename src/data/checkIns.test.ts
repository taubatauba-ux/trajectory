import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { createCheckIn, getCurrentTargets, getLatestCheckIn, isCheckInDue } from './checkIns';
import type { EngineRequest, EngineResponse } from '../engine/engine.types';
import type { UserProfile } from '../types/profile';

function fakeProfile(): UserProfile {
  return {
    id: 'p1',
    sex: 'female',
    dateOfBirth: '1994-05-01',
    heightCm: 165,
    goal: { type: 'cut' },
    measurements: {},
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

function fakeRequest(): EngineRequest {
  return { profile: fakeProfile(), history: { weighIns: [], dailyLogs: [] } };
}

function fakeResponse(overrides: Partial<EngineResponse> = {}): EngineResponse {
  return {
    targets: { kcal: 1800, proteinG: 120, fatG: 60, carbG: 180 },
    effectiveFrom: '2026-07-10',
    nextCheckIn: '2026-07-17',
    ...overrides,
  };
}

afterEach(async () => {
  await db.checkIns.clear();
});

describe('createCheckIn / getLatestCheckIn', () => {
  it('returns undefined before any check-in exists', async () => {
    expect(await getLatestCheckIn()).toBeUndefined();
    expect(await getCurrentTargets()).toBeUndefined();
  });

  it('accepts a pre-generated id, e.g. so a ProgressPhoto can reference it before it exists', async () => {
    const created = await createCheckIn({
      id: 'preset-id-123',
      date: '2026-07-10',
      engineRequestSnapshot: fakeRequest(),
      engineResponseSnapshot: fakeResponse(),
    });
    expect(created.id).toBe('preset-id-123');
    expect((await getLatestCheckIn())?.id).toBe('preset-id-123');
  });

  it('persists a check-in and returns it as latest', async () => {
    const created = await createCheckIn({
      date: '2026-07-10',
      engineRequestSnapshot: fakeRequest(),
      engineResponseSnapshot: fakeResponse(),
    });
    expect(created.id).toBeTruthy();

    const latest = await getLatestCheckIn();
    expect(latest?.id).toBe(created.id);
    expect((await getCurrentTargets())?.targets.kcal).toBe(1800);
  });

  it('treats the chronologically latest date as "latest", not insertion order', async () => {
    await createCheckIn({
      date: '2026-07-10',
      engineRequestSnapshot: fakeRequest(),
      engineResponseSnapshot: fakeResponse({ targets: { kcal: 1800, proteinG: 120, fatG: 60, carbG: 180 } }),
    });
    await createCheckIn({
      date: '2026-07-03', // earlier date, inserted second
      engineRequestSnapshot: fakeRequest(),
      engineResponseSnapshot: fakeResponse({ targets: { kcal: 1700, proteinG: 110, fatG: 55, carbG: 170 } }),
    });

    const latest = await getLatestCheckIn();
    expect(latest?.date).toBe('2026-07-10');
  });
});

describe('isCheckInDue', () => {
  it('is false with no prior check-in', () => {
    expect(isCheckInDue(undefined, '2026-07-14')).toBe(false);
  });

  it('is false when nextCheckIn is null (Engine has not decided yet)', () => {
    const checkIn = {
      id: 'c1',
      date: '2026-07-10',
      engineRequestSnapshot: fakeRequest(),
      engineResponseSnapshot: fakeResponse({ nextCheckIn: null }),
    };
    expect(isCheckInDue(checkIn, '2026-07-20')).toBe(false);
  });

  it('is false before nextCheckIn, true on or after it', () => {
    const checkIn = {
      id: 'c1',
      date: '2026-07-10',
      engineRequestSnapshot: fakeRequest(),
      engineResponseSnapshot: fakeResponse({ nextCheckIn: '2026-07-17' }),
    };
    expect(isCheckInDue(checkIn, '2026-07-16')).toBe(false);
    expect(isCheckInDue(checkIn, '2026-07-17')).toBe(true);
    expect(isCheckInDue(checkIn, '2026-07-20')).toBe(true);
  });
});
