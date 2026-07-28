import { describe, expect, it } from 'vitest';
import { canProceedFromMeasurements, canProceedFromWeighIn, isPositiveNumber, type CheckInState } from './checkInState';

function baseState(overrides: Partial<CheckInState> = {}): CheckInState {
  return { weightKg: '', measurementUpdates: {}, photoBlob: null, ...overrides };
}

describe('isPositiveNumber', () => {
  it('accepts a positive number string', () => {
    expect(isPositiveNumber('70.5')).toBe(true);
  });

  it('rejects empty, zero, negative, and non-numeric strings', () => {
    expect(isPositiveNumber('')).toBe(false);
    expect(isPositiveNumber('   ')).toBe(false);
    expect(isPositiveNumber('0')).toBe(false);
    expect(isPositiveNumber('-3')).toBe(false);
    expect(isPositiveNumber('abc')).toBe(false);
  });
});

describe('canProceedFromWeighIn', () => {
  it('is true with a valid positive weight', () => {
    expect(canProceedFromWeighIn(baseState({ weightKg: '68.2' }))).toBe(true);
  });

  it('is false with no weight entered', () => {
    expect(canProceedFromWeighIn(baseState({ weightKg: '' }))).toBe(false);
  });
});

describe('canProceedFromMeasurements', () => {
  it('is true with no updates at all', () => {
    expect(canProceedFromMeasurements(baseState({ measurementUpdates: {} }))).toBe(true);
  });

  it('is true when every entered field is left blank (unchanged from the pre-filled profile value)', () => {
    const state = baseState({ measurementUpdates: { leanBodyMassKg: '', bodyFatPercent: '' } });
    expect(canProceedFromMeasurements(state)).toBe(true);
  });

  it('is true when a field has a valid positive number', () => {
    const state = baseState({ measurementUpdates: { leanBodyMassKg: '54.2' } });
    expect(canProceedFromMeasurements(state)).toBe(true);
  });

  it('is false when a field has been typed into but is not a valid positive number', () => {
    const state = baseState({ measurementUpdates: { leanBodyMassKg: '-1' } });
    expect(canProceedFromMeasurements(state)).toBe(false);
  });

  it('one invalid field fails the whole step even if others are fine', () => {
    const state = baseState({ measurementUpdates: { leanBodyMassKg: '54', bodyFatPercent: 'abc' } });
    expect(canProceedFromMeasurements(state)).toBe(false);
  });
});
