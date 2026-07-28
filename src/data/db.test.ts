import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db, updateProfile } from './db';
import type { UserProfile } from '../types/profile';

afterEach(async () => {
  await db.profile.clear();
});

const EXISTING: UserProfile = {
  id: 'p1',
  sex: 'male',
  dateOfBirth: '1990-01-01',
  heightCm: 180,
  goal: { type: 'maintain' },
  measurements: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('updateProfile', () => {
  it('preserves id and createdAt from the existing profile, applying only the patch fields', async () => {
    const updated = await updateProfile(EXISTING, {
      sex: 'male',
      dateOfBirth: '1990-01-01',
      heightCm: 181,
      goal: { type: 'cut', targetWeightKg: 75 },
      measurements: { waistCm: 80 },
    });
    expect(updated.id).toBe('p1');
    expect(updated.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(updated.heightCm).toBe(181);
    expect(updated.goal).toEqual({ type: 'cut', targetWeightKg: 75 });
  });

  it('bumps updatedAt to a new timestamp', async () => {
    const updated = await updateProfile(EXISTING, {
      sex: 'male',
      dateOfBirth: '1990-01-01',
      heightCm: 180,
      goal: { type: 'maintain' },
      measurements: {},
    });
    expect(updated.updatedAt).not.toBe(EXISTING.updatedAt);
    expect(Number.isNaN(new Date(updated.updatedAt).getTime())).toBe(false);
  });

  it('actually persists the change to Dexie, replacing the existing row rather than adding a second one', async () => {
    await db.profile.put(EXISTING);
    await updateProfile(EXISTING, {
      sex: 'male',
      dateOfBirth: '1990-01-01',
      heightCm: 185,
      goal: { type: 'maintain' },
      measurements: {},
    });
    expect(await db.profile.count()).toBe(1);
    const stored = await db.profile.get('p1');
    expect(stored?.heightCm).toBe(185);
  });
});
