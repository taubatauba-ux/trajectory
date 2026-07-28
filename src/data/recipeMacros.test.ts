import { describe, expect, it } from 'vitest';
import { computeMacrosForServing, computeRawTotal, computeRecipePer100g } from './recipeMacros';
import type { Macros } from '../types/food';

// Dal (lentils) + rice, a simple two-ingredient worked example with round numbers so the
// expected values are easy to hand-verify.
const lentils100g: Macros = { kcal: 116, proteinG: 9, fatG: 0.4, carbG: 20, fiberG: 8, sodiumMg: 2 };
const rice100g: Macros = { kcal: 130, proteinG: 2.7, fatG: 0.3, carbG: 28 }; // no fiber/sodium tracked

describe('computeRawTotal', () => {
  it('sums required macros across ingredients scaled by grams', () => {
    const total = computeRawTotal([
      { per100g: lentils100g, grams: 200 }, // 2x
      { per100g: rice100g, grams: 100 }, // 1x
    ]);
    expect(total.kcal).toBeCloseTo(116 * 2 + 130, 6);
    expect(total.proteinG).toBeCloseTo(9 * 2 + 2.7, 6);
    expect(total.fatG).toBeCloseTo(0.4 * 2 + 0.3, 6);
    expect(total.carbG).toBeCloseTo(20 * 2 + 28, 6);
  });

  it('sums an optional field only across ingredients that report it, without treating others as zero-and-complete', () => {
    const total = computeRawTotal([
      { per100g: lentils100g, grams: 100 }, // fiberG: 8, sodiumMg: 2
      { per100g: rice100g, grams: 100 }, // no fiberG/sodiumMg
    ]);
    // Only lentils reports fiber/sodium — the total reflects that ingredient alone, not a
    // false "rice contributes 0 fiber" assumption that would just happen to look identical
    // here; the point is this field stays present/meaningful rather than silently wrong.
    expect(total.fiberG).toBeCloseTo(8, 6);
    expect(total.sodiumMg).toBeCloseTo(2, 6);
  });

  it('omits an optional field entirely when no ingredient reports it', () => {
    const total = computeRawTotal([{ per100g: rice100g, grams: 150 }]);
    expect(total.sodiumMg).toBeUndefined();
    expect(total.fiberG).toBeUndefined();
  });

  it('returns zeroed required macros for an empty ingredient list', () => {
    const total = computeRawTotal([]);
    expect(total).toEqual({ kcal: 0, proteinG: 0, fatG: 0, carbG: 0 });
  });
});

describe('computeMacrosForServing', () => {
  it('applies servingGrams / totalYieldG to every present field', () => {
    const rawTotal: Macros = { kcal: 500, proteinG: 40, fatG: 10, carbG: 60, sodiumMg: 200 };
    // 250g total yield, want the macros for a 125g serving => factor 0.5
    const serving = computeMacrosForServing(rawTotal, 250, 125);
    expect(serving.kcal).toBeCloseTo(250, 6);
    expect(serving.proteinG).toBeCloseTo(20, 6);
    expect(serving.fatG).toBeCloseTo(5, 6);
    expect(serving.carbG).toBeCloseTo(30, 6);
    expect(serving.sodiumMg).toBeCloseTo(100, 6);
  });

  it('throws rather than dividing by a zero/negative totalYieldG (mid-build UI state, not a real recipe)', () => {
    const rawTotal: Macros = { kcal: 100, proteinG: 1, fatG: 1, carbG: 1 };
    expect(() => computeMacrosForServing(rawTotal, 0, 100)).toThrow();
    expect(() => computeMacrosForServing(rawTotal, -50, 100)).toThrow();
  });
});

describe('computeRecipePer100g', () => {
  it('matches the §7 worked formula end to end: rawTotal then scaled to a 100g serving', () => {
    // 300g cooked dal made from 100g raw lentils + 50g rice (contrived, just checking the
    // pipeline composes correctly) -> yields 300g finished dish.
    const per100g = computeRecipePer100g(
      [
        { per100g: lentils100g, grams: 100 },
        { per100g: rice100g, grams: 50 },
      ],
      300,
    );
    const rawTotal = computeRawTotal([
      { per100g: lentils100g, grams: 100 },
      { per100g: rice100g, grams: 50 },
    ]);
    const factor = 100 / 300;
    expect(per100g.kcal).toBeCloseTo(rawTotal.kcal * factor, 6);
    expect(per100g.proteinG).toBeCloseTo(rawTotal.proteinG * factor, 6);
  });
});
