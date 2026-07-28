import { describe, it, expect } from 'vitest';
import { describeFlag, describeFlags } from './flagLabels';

describe('describeFlag', () => {
  it('maps every known engine flag to a non-empty label', () => {
    const known = [
      'insufficient_data',
      'possible_transient_weight_shift',
      'calorie_floor_applied',
      'low_bmi_deficit_caution',
      'pharmacologically_assisted_profile_active',
      'under_minimum_age_exclusion',
      'pregnancy_breastfeeding_status_unconfirmed',
      'stub_engine',
      'engine_fallback_to_stub',
    ];
    for (const flag of known) {
      const info = describeFlag(flag);
      expect(info.label.length).toBeGreaterThan(0);
      expect(['info', 'caution', 'dev']).toContain(info.tone);
    }
  });

  it('marks health-relevant safety flags as caution tone', () => {
    expect(describeFlag('calorie_floor_applied').tone).toBe('caution');
    expect(describeFlag('low_bmi_deficit_caution').tone).toBe('caution');
    expect(describeFlag('pregnancy_breastfeeding_status_unconfirmed').tone).toBe('caution');
  });

  it('falls back to a humanized label for an unrecognized flag instead of dropping it', () => {
    const info = describeFlag('some_future_flag_not_yet_mapped');
    expect(info.label).toBe('Some future flag not yet mapped');
    expect(info.tone).toBe('info');
  });
});

describe('describeFlags', () => {
  it('collapses the redundant stub_engine + engine_fallback_to_stub pair into one', () => {
    const result = describeFlags(['calorie_floor_applied', 'stub_engine', 'engine_fallback_to_stub']);
    expect(result.map((f) => f.key)).toEqual(['calorie_floor_applied', 'engine_fallback_to_stub']);
  });

  it('leaves stub_engine alone when it appears without the fallback flag', () => {
    const result = describeFlags(['stub_engine']);
    expect(result.map((f) => f.key)).toEqual(['stub_engine']);
  });

  it('returns an empty array for no flags', () => {
    expect(describeFlags([])).toEqual([]);
  });
});
