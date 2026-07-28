import { describe, expect, it } from 'vitest';
import {
  canProceedFromAboutYou,
  canProceedFromBodyComposition,
  canProceedFromGoal,
  initialOnboardingState,
  slugifyMeasurementKey,
  type OnboardingState,
} from './onboardingState';

function baseState(overrides: Partial<OnboardingState> = {}): OnboardingState {
  return { ...initialOnboardingState, ...overrides };
}

describe('slugifyMeasurementKey', () => {
  it('converts a multi-word label to camelCase', () => {
    expect(slugifyMeasurementKey('Hip circumference')).toBe('hipCircumference');
    expect(slugifyMeasurementKey('waist')).toBe('waist');
  });

  it('collapses extra whitespace and normalizes case', () => {
    expect(slugifyMeasurementKey('  Neck   Size ')).toBe('neckSize');
  });

  it('returns an empty string for an empty label', () => {
    expect(slugifyMeasurementKey('   ')).toBe('');
  });
});

describe('canProceedFromAboutYou', () => {
  const valid = baseState({ sex: 'female', dateOfBirth: '1994-05-01', heightCm: '165', currentWeightKg: '60' });

  it('is true once sex, a sane date of birth, height, and weight are all set', () => {
    expect(canProceedFromAboutYou(valid)).toBe(true);
  });

  it('is false with sex unset', () => {
    expect(canProceedFromAboutYou({ ...valid, sex: null })).toBe(false);
  });

  it('is false for a future date of birth', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(canProceedFromAboutYou({ ...valid, dateOfBirth: future.toISOString().slice(0, 10) })).toBe(false);
  });

  it('is false for a non-positive height or weight', () => {
    expect(canProceedFromAboutYou({ ...valid, heightCm: '0' })).toBe(false);
    expect(canProceedFromAboutYou({ ...valid, currentWeightKg: '-5' })).toBe(false);
    expect(canProceedFromAboutYou({ ...valid, currentWeightKg: 'abc' })).toBe(false);
  });
});

describe('canProceedFromGoal', () => {
  it('is true with no target weight entered (it is optional)', () => {
    expect(canProceedFromGoal(baseState({ targetWeightKg: '' }))).toBe(true);
  });

  it('is true with a valid positive target weight', () => {
    expect(canProceedFromGoal(baseState({ targetWeightKg: '65' }))).toBe(true);
  });

  it('is false with a non-numeric or non-positive target weight', () => {
    expect(canProceedFromGoal(baseState({ targetWeightKg: '-1' }))).toBe(false);
    expect(canProceedFromGoal(baseState({ targetWeightKg: 'abc' }))).toBe(false);
  });
});

describe('canProceedFromBodyComposition', () => {
  it('is true with no measurement rows at all (the whole step is optional)', () => {
    expect(canProceedFromBodyComposition(baseState({ measurements: [] }))).toBe(true);
  });

  it('is true for a completely untouched row (added but never filled in)', () => {
    const state = baseState({
      measurements: [{ id: '1', key: '', label: '', value: '', suggested: false }],
    });
    expect(canProceedFromBodyComposition(state)).toBe(true);
  });

  it('is true for a fully-filled row', () => {
    const state = baseState({
      measurements: [{ id: '1', key: 'leanBodyMassKg', label: 'Lean body mass', value: '55', suggested: true }],
    });
    expect(canProceedFromBodyComposition(state)).toBe(true);
  });

  it('is false for a row with a key but no valid value', () => {
    const state = baseState({
      measurements: [{ id: '1', key: 'leanBodyMassKg', label: 'Lean body mass', value: '', suggested: true }],
    });
    expect(canProceedFromBodyComposition(state)).toBe(false);
  });
});
