import { describe, it, expect } from 'vitest';
import { segmentIntoEpisodes, computeCycleStats } from './cycleStats';
import type { PeriodEntry } from '../../types';

function flowEntry(date: string): PeriodEntry {
  return { id: date, date, flow: 'medium' };
}
function symptomOnlyEntry(date: string): PeriodEntry {
  return { id: date, date, symptoms: ['cramps'] };
}

describe('segmentIntoEpisodes', () => {
  it('returns nothing for no entries', () => {
    expect(segmentIntoEpisodes([])).toEqual([]);
  });

  it('groups consecutive flow-days into one episode', () => {
    const entries = ['2026-06-01', '2026-06-02', '2026-06-03'].map(flowEntry);
    expect(segmentIntoEpisodes(entries)).toEqual([
      { startDate: '2026-06-01', endDate: '2026-06-03', lengthDays: 3 },
    ]);
  });

  it('splits into separate episodes across a gap', () => {
    const entries = [
      ...['2026-06-01', '2026-06-02'].map(flowEntry),
      ...['2026-07-01', '2026-07-02', '2026-07-03'].map(flowEntry),
    ];
    expect(segmentIntoEpisodes(entries)).toEqual([
      { startDate: '2026-06-01', endDate: '2026-06-02', lengthDays: 2 },
      { startDate: '2026-07-01', endDate: '2026-07-03', lengthDays: 3 },
    ]);
  });

  it('excludes symptom-only entries (no flow) from episodes entirely', () => {
    const entries = [
      symptomOnlyEntry('2026-06-28'), // PMS a few days before bleeding starts
      symptomOnlyEntry('2026-06-29'),
      flowEntry('2026-07-01'),
      flowEntry('2026-07-02'),
    ];
    expect(segmentIntoEpisodes(entries)).toEqual([
      { startDate: '2026-07-01', endDate: '2026-07-02', lengthDays: 2 },
    ]);
  });

  it('sorts out-of-order input before segmenting', () => {
    const entries = [flowEntry('2026-06-02'), flowEntry('2026-06-01')];
    expect(segmentIntoEpisodes(entries)).toEqual([
      { startDate: '2026-06-01', endDate: '2026-06-02', lengthDays: 2 },
    ]);
  });

  it('does not bridge a one-day gap mid-period (deliberate simplification)', () => {
    const entries = [flowEntry('2026-06-01'), flowEntry('2026-06-03')]; // skips 06-02
    expect(segmentIntoEpisodes(entries)).toHaveLength(2);
  });
});

describe('computeCycleStats', () => {
  it('returns all-null/empty stats for no history', () => {
    const stats = computeCycleStats([], '2026-07-14');
    expect(stats).toEqual({
      episodes: [],
      avgCycleLengthDays: null,
      avgPeriodLengthDays: null,
      predictedNextStart: null,
      currentCycleDay: null,
    });
  });

  it('with exactly one episode: period length known, cycle length and prediction unknown', () => {
    const entries = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04'].map(flowEntry);
    const stats = computeCycleStats(entries, '2026-06-10');
    expect(stats.avgPeriodLengthDays).toBe(4);
    expect(stats.avgCycleLengthDays).toBeNull(); // needs ≥2 episodes
    expect(stats.predictedNextStart).toBeNull();
    expect(stats.currentCycleDay).toBe(10); // June 10 is day 10 of a cycle starting June 1
  });

  it('computes average cycle length across consecutive episode starts', () => {
    const entries = [
      ...['2026-05-01', '2026-05-02', '2026-05-03'].map(flowEntry), // 3-day period
      ...['2026-06-01', '2026-06-02'].map(flowEntry), // starts 31 days after May 1
      ...['2026-07-03', '2026-07-04'].map(flowEntry), // starts 32 days after June 1
    ];
    const stats = computeCycleStats(entries, '2026-07-10');
    // cycle lengths: May1→Jun1 = 31, Jun1→Jul3 = 32 → avg 31.5
    expect(stats.avgCycleLengthDays).toBe(31.5);
    expect(stats.predictedNextStart).toBe('2026-08-04'); // Jul3 + round(31.5)=32 days
    expect(stats.currentCycleDay).toBe(8); // Jul10 is day 8 of the cycle starting Jul3
  });

  it('currentCycleDay is null if the only logged episode is somehow after "today"', () => {
    const entries = [flowEntry('2026-08-01')];
    const stats = computeCycleStats(entries, '2026-07-14');
    expect(stats.currentCycleDay).toBeNull();
  });
});
