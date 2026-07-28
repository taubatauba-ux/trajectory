import { describe, expect, it } from 'vitest';
import { highestSeverity, presentFlag, presentFlags } from './flagPresentation';
import { OUTLIER_FLAG } from './outlierGate';
import { LOW_BMI_FLAG, CALORIE_FLOOR_FLAG } from './targetLimiter';

describe('presentFlag', () => {
  it('maps a known flag to a human label and severity', () => {
    expect(presentFlag(OUTLIER_FLAG).severity).toBe('caution');
    expect(presentFlag(OUTLIER_FLAG).label.length).toBeGreaterThan(0);
  });

  it('degrades gracefully for an unrecognized flag instead of throwing or disappearing', () => {
    const result = presentFlag('some_future_flag_v2');
    expect(result.severity).toBe('info');
    expect(result.label).toBe('some future flag v2');
  });
});

describe('presentFlags', () => {
  it('maps an empty/undefined list to an empty array', () => {
    expect(presentFlags(undefined)).toEqual([]);
    expect(presentFlags([])).toEqual([]);
  });
});

describe('highestSeverity', () => {
  it('is undefined for no flags', () => {
    expect(highestSeverity(undefined)).toBeUndefined();
  });

  it('picks the most severe among several flags, not just the first', () => {
    // CALORIE_FLOOR_FLAG -> caution, LOW_BMI_FLAG -> warning; warning should win
    // regardless of which comes first in the array.
    expect(highestSeverity([CALORIE_FLOOR_FLAG, LOW_BMI_FLAG])).toBe('warning');
    expect(highestSeverity([LOW_BMI_FLAG, CALORIE_FLOOR_FLAG])).toBe('warning');
  });
});
