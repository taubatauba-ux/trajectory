import { describe, expect, it } from 'vitest';
import {
  checkExclusions,
  MIN_AGE_YEARS,
  PREGNANCY_EXCLUSION_UNCONFIRMED_FLAG,
  UNDER_MIN_AGE_FLAG,
  resolveProfileNoise,
  PHARMA_ASSISTED_NOISE_MULTIPLIER,
} from './populationProfiles';

describe('checkExclusions', () => {
  it('flags under-18 and leaves it out for adults', () => {
    expect(checkExclusions(17)).toContain(UNDER_MIN_AGE_FLAG);
    expect(checkExclusions(MIN_AGE_YEARS - 1)).toContain(UNDER_MIN_AGE_FLAG);
    expect(checkExclusions(MIN_AGE_YEARS)).not.toContain(UNDER_MIN_AGE_FLAG);
    expect(checkExclusions(30)).not.toContain(UNDER_MIN_AGE_FLAG);
  });

  it('raises the pregnancy/breastfeeding flag when status is unknown (undefined) — the original, pre-Part-4 behavior for every existing profile', () => {
    expect(checkExclusions(30)).toContain(PREGNANCY_EXCLUSION_UNCONFIRMED_FLAG);
    expect(checkExclusions(30, undefined)).toContain(PREGNANCY_EXCLUSION_UNCONFIRMED_FLAG);
  });

  it('raises the flag when the person IS pregnant or breastfeeding — the whole point of the exclusion', () => {
    expect(checkExclusions(30, 'pregnant')).toContain(PREGNANCY_EXCLUSION_UNCONFIRMED_FLAG);
    expect(checkExclusions(30, 'breastfeeding')).toContain(PREGNANCY_EXCLUSION_UNCONFIRMED_FLAG);
  });

  it('suppresses the flag only for an explicit not_applicable answer', () => {
    expect(checkExclusions(30, 'not_applicable')).not.toContain(PREGNANCY_EXCLUSION_UNCONFIRMED_FLAG);
  });

  it('the two flags are independent — both, either, or neither can be present', () => {
    expect(checkExclusions(16, 'not_applicable')).toEqual([UNDER_MIN_AGE_FLAG]);
    expect(checkExclusions(16, 'pregnant')).toEqual([UNDER_MIN_AGE_FLAG, PREGNANCY_EXCLUSION_UNCONFIRMED_FLAG]);
    expect(checkExclusions(30, 'not_applicable')).toEqual([]);
  });
});

describe('resolveProfileNoise', () => {
  it('passes base noise through unchanged for the general profile', () => {
    const result = resolveProfileNoise('general', 0.05, 3);
    expect(result).toEqual({ sigmaW: 0.05, sigmaTdee: 3, suppressTransientUnwindAssumption: false });
  });

  it('widens noise and suppresses the transient-unwind assumption for the pharma-assisted profile', () => {
    const result = resolveProfileNoise('pharmacologically_assisted', 0.05, 3);
    expect(result.sigmaW).toBeCloseTo(0.05 * PHARMA_ASSISTED_NOISE_MULTIPLIER.sigmaW, 10);
    expect(result.sigmaTdee).toBeCloseTo(3 * PHARMA_ASSISTED_NOISE_MULTIPLIER.sigmaTdee, 10);
    expect(result.suppressTransientUnwindAssumption).toBe(true);
  });
});
