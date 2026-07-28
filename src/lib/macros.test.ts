import { describe, it, expect } from 'vitest';
import { addMacros, sumMacrosList, scaleMacros, ratio, roundKcal, roundGrams, ZERO_MACROS } from './macros';
import type { Macros } from '../types';

describe('addMacros', () => {
  it('adds the required fields', () => {
    const a: Macros = { kcal: 100, proteinG: 5, fatG: 2, carbG: 15 };
    const b: Macros = { kcal: 50, proteinG: 3, fatG: 1, carbG: 8 };
    expect(addMacros(a, b)).toEqual({ kcal: 150, proteinG: 8, fatG: 3, carbG: 23 });
  });

  it('adds optional fields present on both sides', () => {
    const a: Macros = { kcal: 100, proteinG: 5, fatG: 2, carbG: 15, sodiumMg: 200 };
    const b: Macros = { kcal: 50, proteinG: 3, fatG: 1, carbG: 8, sodiumMg: 100 };
    expect(addMacros(a, b).sodiumMg).toBe(300);
  });

  it('treats a missing optional field on one side as zero, not as excluding it', () => {
    const a: Macros = { kcal: 100, proteinG: 5, fatG: 2, carbG: 15, ironMg: 2 };
    const b: Macros = { kcal: 50, proteinG: 3, fatG: 1, carbG: 8 };
    expect(addMacros(a, b).ironMg).toBe(2);
  });

  it('omits an optional field entirely when neither side has it', () => {
    const a: Macros = { kcal: 100, proteinG: 5, fatG: 2, carbG: 15 };
    const b: Macros = { kcal: 50, proteinG: 3, fatG: 1, carbG: 8 };
    expect(addMacros(a, b).sugarG).toBeUndefined();
  });
});

describe('sumMacrosList', () => {
  it('reduces an empty list to ZERO_MACROS', () => {
    expect(sumMacrosList([])).toEqual(ZERO_MACROS);
  });

  it('sums three entries the way a day of logging would', () => {
    const entries: Macros[] = [
      { kcal: 300, proteinG: 10, fatG: 8, carbG: 40 },
      { kcal: 450, proteinG: 25, fatG: 15, carbG: 50 },
      { kcal: 120, proteinG: 2, fatG: 1, carbG: 28 },
    ];
    expect(sumMacrosList(entries)).toEqual({ kcal: 870, proteinG: 37, fatG: 24, carbG: 118 });
  });
});

describe('scaleMacros', () => {
  const per100g: Macros = { kcal: 200, proteinG: 10, fatG: 5, carbG: 30, fiberG: 4 };

  it('is a no-op at 100g', () => {
    expect(scaleMacros(per100g, 100)).toEqual(per100g);
  });

  it('scales down for a smaller portion', () => {
    expect(scaleMacros(per100g, 50)).toEqual({ kcal: 100, proteinG: 5, fatG: 2.5, carbG: 15, fiberG: 2 });
  });

  it('scales up past 100g', () => {
    expect(scaleMacros(per100g, 250)).toEqual({ kcal: 500, proteinG: 25, fatG: 12.5, carbG: 75, fiberG: 10 });
  });

  it('returns zero macros for a zero-gram amount without dividing by zero', () => {
    expect(scaleMacros(per100g, 0)).toEqual({ kcal: 0, proteinG: 0, fatG: 0, carbG: 0, fiberG: 0 });
  });
});

describe('ratio', () => {
  it('divides consumed by target', () => {
    expect(ratio(150, 200)).toBe(0.75);
  });
  it('can exceed 1 — callers decide how to render that, ratio does not clamp', () => {
    expect(ratio(250, 200)).toBe(1.25);
  });
  it('returns 0 rather than NaN/Infinity when target is 0', () => {
    expect(ratio(150, 0)).toBe(0);
  });
});

describe('rounding', () => {
  it('roundKcal rounds to the nearest whole calorie', () => {
    expect(roundKcal(199.6)).toBe(200);
  });
  it('roundGrams rounds to the nearest whole gram', () => {
    expect(roundGrams(99.4)).toBe(99);
  });
});
