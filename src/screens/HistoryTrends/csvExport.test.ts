import { describe, it, expect } from 'vitest';
import { buildHistoryCsv } from './csvExport';
import type { Macros, WeighIn } from '../../types';

describe('buildHistoryCsv', () => {
  it('emits the documented header', () => {
    const csv = buildHistoryCsv([], new Map());
    expect(csv).toBe('date,weight_kg,kcal,protein_g,carb_g,fat_g');
  });

  it('merges weigh-ins and daily totals by date, sorted ascending', () => {
    const weighIns: WeighIn[] = [
      { id: 'w2', date: '2026-07-02', weightKg: 69.8 },
      { id: 'w1', date: '2026-07-01', weightKg: 70.2 },
    ];
    const dailyTotals = new Map<string, Macros>([
      ['2026-07-01', { kcal: 2010, proteinG: 141, fatG: 62, carbG: 199 }],
    ]);
    const csv = buildHistoryCsv(weighIns, dailyTotals);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('date,weight_kg,kcal,protein_g,carb_g,fat_g');
    expect(lines[1]).toBe('2026-07-01,70.2,2010,141,199,62');
    // 2026-07-02 has a weigh-in but no log — macro cells blank, not zero.
    expect(lines[2]).toBe('2026-07-02,69.8,,,,');
  });

  it('leaves the weight cell blank on a logged day with no weigh-in', () => {
    const dailyTotals = new Map<string, Macros>([
      ['2026-07-01', { kcal: 1800, proteinG: 130, fatG: 55, carbG: 180 }],
    ]);
    const csv = buildHistoryCsv([], dailyTotals);
    expect(csv.split('\n')[1]).toBe('2026-07-01,,1800,130,180,55');
  });

  it('rounds weight to 1 decimal and macros to whole numbers', () => {
    const weighIns: WeighIn[] = [{ id: 'w1', date: '2026-07-01', weightKg: 70.2345 }];
    const dailyTotals = new Map<string, Macros>([
      ['2026-07-01', { kcal: 2010.6, proteinG: 140.9, fatG: 61.5, carbG: 199.2 }],
    ]);
    const csv = buildHistoryCsv(weighIns, dailyTotals);
    expect(csv.split('\n')[1]).toBe('2026-07-01,70.2,2011,141,199,62');
  });
});
