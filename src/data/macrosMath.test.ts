import { describe, expect, it } from 'vitest';
import { scaleMacros, sumMacros } from './macrosMath';
import type { Macros } from '../types/food';

describe('scaleMacros', () => {
  it('scales required and present-optional fields, leaves absent fields absent', () => {
    const m: Macros = { kcal: 200, proteinG: 10, fatG: 5, carbG: 20, ironMg: 2 };
    const scaled = scaleMacros(m, 1.5);
    expect(scaled).toEqual({ kcal: 300, proteinG: 15, fatG: 7.5, carbG: 30, ironMg: 3 });
    expect(scaled.sodiumMg).toBeUndefined();
  });
});

describe('sumMacros', () => {
  it('sums required fields across an empty list as all zero', () => {
    expect(sumMacros([])).toEqual({ kcal: 0, proteinG: 0, fatG: 0, carbG: 0 });
  });

  it('sums an optional field only where present, omitting it if nobody reports it', () => {
    const a: Macros = { kcal: 100, proteinG: 5, fatG: 2, carbG: 10, sodiumMg: 50 };
    const b: Macros = { kcal: 50, proteinG: 2, fatG: 1, carbG: 5 }; // no sodiumMg
    const total = sumMacros([a, b]);
    expect(total.kcal).toBe(150);
    expect(total.sodiumMg).toBe(50); // only a's contribution, not "b contributes 0"

    const noSodiumAnywhere = sumMacros([b, b]);
    expect(noSodiumAnywhere.sodiumMg).toBeUndefined();
  });
});
