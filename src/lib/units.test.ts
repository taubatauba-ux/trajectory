import { describe, it, expect } from 'vitest';
import {
  kgToLb,
  lbToKg,
  cmToFtIn,
  ftInToCm,
  formatWeight,
  formatHeight,
  weightUnitLabel,
  toDisplayWeightValue,
  parseWeightInput,
} from './units';

describe('kg/lb round trip', () => {
  it('converts a known reference value both ways', () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 2);
    expect(lbToKg(220.462)).toBeCloseTo(100, 2);
  });
  it('round-trips within floating point tolerance', () => {
    expect(lbToKg(kgToLb(82.3))).toBeCloseTo(82.3, 6);
  });
});

describe('cmToFtIn', () => {
  it('converts a known reference height', () => {
    // 178cm is a common reference point (~5'10")
    expect(cmToFtIn(178)).toEqual({ ft: 5, inches: 10 });
  });
  it('carries into the next foot when rounding hits 12 inches', () => {
    // 182.88cm is exactly 6'0" — a value just under it should still round to 6'0",
    // not 5'12", once rounded to the nearest whole inch.
    expect(cmToFtIn(182.8)).toEqual({ ft: 6, inches: 0 });
  });
});

describe('ftInToCm', () => {
  it('is the inverse of cmToFtIn for a whole-inch height', () => {
    expect(ftInToCm(5, 10)).toBeCloseTo(177.8, 1);
  });
});

describe('formatWeight', () => {
  it('formats metric to one decimal with a kg suffix', () => {
    expect(formatWeight(82.34, 'metric')).toBe('82.3 kg');
  });
  it('formats imperial as a whole number with an lb suffix', () => {
    expect(formatWeight(82.34, 'imperial')).toBe('182 lb');
  });
});

describe('formatHeight', () => {
  it('formats metric as whole cm', () => {
    expect(formatHeight(177.8, 'metric')).toBe('178 cm');
  });
  it('formats imperial as feet\'inches"', () => {
    expect(formatHeight(177.8, 'imperial')).toBe(`5'10"`);
  });
});

describe('weightUnitLabel', () => {
  it('returns the right suffix per unit', () => {
    expect(weightUnitLabel('metric')).toBe('kg');
    expect(weightUnitLabel('imperial')).toBe('lb');
  });
});

describe('toDisplayWeightValue / parseWeightInput round trip', () => {
  it('a value stored in kg displays and re-parses back to the same kg in either unit', () => {
    const storedKg = 90;
    for (const unit of ['metric', 'imperial'] as const) {
      const displayed = toDisplayWeightValue(storedKg, unit);
      const reparsed = parseWeightInput(displayed, unit);
      expect(reparsed).toBeCloseTo(storedKg, 1);
    }
  });
});
