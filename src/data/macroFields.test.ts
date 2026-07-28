import { describe, expect, it } from 'vitest';
import { formatMacroValue, populatedMacroFields, MACRO_FIELDS } from './macroFields';
import type { Macros } from '../types/food';

describe('populatedMacroFields', () => {
  it('always includes the four headline fields, even when zero', () => {
    const macros: Macros = { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 };
    const fields = populatedMacroFields(macros);
    expect(fields.map((f) => f.def.key).sort()).toEqual(['carbG', 'fatG', 'kcal', 'proteinG'].sort());
  });

  it('includes only the extended fields that are actually populated', () => {
    const macros: Macros = { kcal: 100, proteinG: 5, fatG: 2, carbG: 10, sodiumMg: 50 };
    const fields = populatedMacroFields(macros);
    const keys = fields.map((f) => f.def.key);
    expect(keys).toContain('sodiumMg');
    expect(keys).not.toContain('fiberG');
    expect(keys).not.toContain('ironMg');
  });

  it('pairs each field with its actual value', () => {
    const macros: Macros = { kcal: 250, proteinG: 12, fatG: 8, carbG: 30, ironMg: 3.5 };
    const fields = populatedMacroFields(macros);
    const iron = fields.find((f) => f.def.key === 'ironMg');
    expect(iron?.value).toBe(3.5);
  });
});

describe('formatMacroValue', () => {
  it('rounds kcal and mg fields to whole numbers', () => {
    const kcalDef = MACRO_FIELDS.find((f) => f.key === 'kcal')!;
    const sodiumDef = MACRO_FIELDS.find((f) => f.key === 'sodiumMg')!;
    expect(formatMacroValue(kcalDef, 142.6)).toBe('143');
    expect(formatMacroValue(sodiumDef, 49.5)).toBe('50');
  });

  it('keeps one decimal for gram fields', () => {
    const proteinDef = MACRO_FIELDS.find((f) => f.key === 'proteinG')!;
    expect(formatMacroValue(proteinDef, 12.34)).toBe('12.3');
    expect(formatMacroValue(proteinDef, 12)).toBe('12');
  });
});
