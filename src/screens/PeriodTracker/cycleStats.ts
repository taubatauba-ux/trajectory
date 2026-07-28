// §9.10: "Simple calendar-based flow/symptom logging... independent of nutrition loop
// but stored in same local DB." Everything here is a simple historical-average
// calculation, not a clinical/fertility-prediction model — predictions are explicitly
// framed as rough estimates (see index.tsx's copy) rather than claiming precision this
// simple an approach can't actually deliver. All local-only, matching this app's
// no-network architecture — nothing here is computed by or sent to a server.
import type { PeriodEntry } from '../../types';
import { addDaysISO, daysBetweenISO } from '../_shared/dates';

export interface PeriodEpisode {
  startDate: string;
  endDate: string;
  lengthDays: number;
}

/**
 * Groups entries into episodes ("periods") of consecutive calendar days. Only entries
 * with a `flow` value count — a day with only `symptoms` logged (e.g. PMS cramps a few
 * days before bleeding starts) isn't itself a bleeding day, and folding it in would
 * distort cycle-length math. A single missed day (no flow entry) ends an episode; this
 * app doesn't try to bridge a one-day gap mid-period, which real cycles sometimes have
 * — a deliberate simplification, see PART5_PROGRESS_REPORT.md.
 */
export function segmentIntoEpisodes(entries: readonly PeriodEntry[]): PeriodEpisode[] {
  const flowDates = entries
    .filter((e) => e.flow !== undefined)
    .map((e) => e.date)
    .sort((a, b) => a.localeCompare(b));

  const episodes: PeriodEpisode[] = [];
  for (const date of flowDates) {
    const current = episodes[episodes.length - 1];
    if (current && daysBetweenISO(current.endDate, date) === 1) {
      current.endDate = date;
      current.lengthDays += 1;
    } else {
      episodes.push({ startDate: date, endDate: date, lengthDays: 1 });
    }
  }
  return episodes;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export interface CycleStatsSummary {
  episodes: PeriodEpisode[];
  /** Mean of (next episode's start − this episode's start), across every consecutive
   * pair. Null with fewer than 2 episodes — one data point isn't an average. */
  avgCycleLengthDays: number | null;
  avgPeriodLengthDays: number | null;
  /** Last episode's start + avgCycleLengthDays, rounded. Null unless both a most-recent
   * episode AND an average cycle length exist. */
  predictedNextStart: string | null;
  /** 1-indexed day of the current cycle (today − last episode's start + 1). Null if no
   * episode has been logged yet, or if the last logged episode is somehow in the future. */
  currentCycleDay: number | null;
}

export function computeCycleStats(entries: readonly PeriodEntry[], today: string): CycleStatsSummary {
  const episodes = segmentIntoEpisodes(entries);

  const cycleLengths: number[] = [];
  for (let i = 1; i < episodes.length; i++) {
    cycleLengths.push(daysBetweenISO(episodes[i - 1]!.startDate, episodes[i]!.startDate));
  }
  const avgCycleLengthDays = average(cycleLengths);
  const avgPeriodLengthDays = average(episodes.map((e) => e.lengthDays));

  const lastEpisode = episodes[episodes.length - 1];
  const predictedNextStart =
    lastEpisode && avgCycleLengthDays !== null
      ? addDaysISO(lastEpisode.startDate, Math.round(avgCycleLengthDays))
      : null;

  const currentCycleDay =
    lastEpisode && daysBetweenISO(lastEpisode.startDate, today) >= 0
      ? daysBetweenISO(lastEpisode.startDate, today) + 1
      : null;

  return { episodes, avgCycleLengthDays, avgPeriodLengthDays, predictedNextStart, currentCycleDay };
}
