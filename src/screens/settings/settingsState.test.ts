import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../../types/profile';
import {
  profileToSettingsState,
  settingsStateToProfilePatch,
  isSettingsFormValid,
  type SettingsFormState,
} from './settingsState';

function baseProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'p1',
    sex: 'female',
    dateOfBirth: '1994-03-10',
    heightCm: 165,
    goal: { type: 'cut', targetWeightKg: 60 },
    measurements: { leanBodyMassKg: 45, waistCm: 78 },
    activityNote: 'runs 3x a week',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('profileToSettingsState', () => {
  it('populates every editable field from the stored profile', () => {
    const state = profileToSettingsState(baseProfile());
    expect(state.sex).toBe('female');
    expect(state.heightCm).toBe('165');
    expect(state.goalType).toBe('cut');
    expect(state.targetWeightKg).toBe('60');
    expect(state.activityNote).toBe('runs 3x a week');
    expect(state.measurements).toHaveLength(2);
  });

  it('marks Engine-recognized measurement keys as suggested (locked-label) rows', () => {
    const state = profileToSettingsState(baseProfile());
    const lbm = state.measurements.find((m) => m.key === 'leanBodyMassKg');
    expect(lbm?.suggested).toBe(true);
    expect(lbm?.label).toBe('Lean body mass');
    const waist = state.measurements.find((m) => m.key === 'waistCm');
    expect(waist?.suggested).toBe(false);
  });

  it('defaults pharmacologicallyAssisted to false and unitPreference to metric when unset (pre-Part-6 profiles)', () => {
    const state = profileToSettingsState(baseProfile());
    expect(state.pharmacologicallyAssisted).toBe(false);
    expect(state.unitPreference).toBe('metric');
  });

  it('carries an explicit unitPreference/pharmacologicallyAssisted through unchanged', () => {
    const state = profileToSettingsState(
      baseProfile({ pharmacologicallyAssisted: true, unitPreference: 'imperial' }),
    );
    expect(state.pharmacologicallyAssisted).toBe(true);
    expect(state.unitPreference).toBe('imperial');
  });
});

describe('settingsStateToProfilePatch', () => {
  it('round-trips a profile through form state and back without loss', () => {
    const original = baseProfile({ pharmacologicallyAssisted: true, unitPreference: 'imperial' });
    const state = profileToSettingsState(original);
    const patch = settingsStateToProfilePatch(state);
    expect(patch).toEqual({
      sex: original.sex,
      dateOfBirth: original.dateOfBirth,
      heightCm: original.heightCm,
      goal: original.goal,
      measurements: original.measurements,
      activityNote: original.activityNote,
      pregnancyOrBreastfeedingStatus: original.pregnancyOrBreastfeedingStatus,
      pharmacologicallyAssisted: true,
      unitPreference: 'imperial',
    });
  });

  it('omits targetWeightKg entirely when left blank, rather than writing NaN or 0', () => {
    const state = profileToSettingsState(baseProfile({ goal: { type: 'maintain' } }));
    const patch = settingsStateToProfilePatch(state);
    expect(patch.goal).toEqual({ type: 'maintain' });
    expect('targetWeightKg' in patch.goal).toBe(false);
  });

  it('drops empty/untouched measurement rows rather than writing blank entries', () => {
    const state = profileToSettingsState(baseProfile({ measurements: {} }));
    state.measurements.push({ id: 'x', key: '', label: '', value: '', suggested: false });
    const patch = settingsStateToProfilePatch(state);
    expect(patch.measurements).toEqual({});
  });
});

describe('isSettingsFormValid', () => {
  function validState(): SettingsFormState {
    return profileToSettingsState(baseProfile());
  }

  it('accepts a well-formed state', () => {
    expect(isSettingsFormValid(validState())).toBe(true);
  });

  it('rejects a missing or future date of birth', () => {
    expect(isSettingsFormValid({ ...validState(), dateOfBirth: '' })).toBe(false);
    expect(isSettingsFormValid({ ...validState(), dateOfBirth: '2099-01-01' })).toBe(false);
  });

  it('rejects a non-positive height', () => {
    expect(isSettingsFormValid({ ...validState(), heightCm: '0' })).toBe(false);
    expect(isSettingsFormValid({ ...validState(), heightCm: 'abc' })).toBe(false);
  });

  it('allows a blank target weight but rejects a non-positive one if entered', () => {
    expect(isSettingsFormValid({ ...validState(), targetWeightKg: '' })).toBe(true);
    expect(isSettingsFormValid({ ...validState(), targetWeightKg: '-5' })).toBe(false);
  });

  it('rejects a measurement row with a value but no key, and vice versa', () => {
    const withOrphanValue: SettingsFormState = {
      ...validState(),
      measurements: [{ id: 'x', key: '', label: '', value: '50', suggested: false }],
    };
    expect(isSettingsFormValid(withOrphanValue)).toBe(false);
  });

  it('allows a fully empty (untouched) custom measurement row', () => {
    const withEmptyRow: SettingsFormState = {
      ...validState(),
      measurements: [{ id: 'x', key: '', label: '', value: '', suggested: false }],
    };
    expect(isSettingsFormValid(withEmptyRow)).toBe(true);
  });
});
