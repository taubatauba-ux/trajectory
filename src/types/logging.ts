// §4.3 Logging. Source of truth: trajectory-app-technical-specification.md §4.3.
import type { Macros } from './food';

export interface LogEntry {
  id: string;
  date: string;
  /** ISO timestamp, drives the timeline order (§9.2). */
  loggedAt: string;
  foodItemId: string;
  grams: number;
  /** SNAPSHOT — editing a food later must never rewrite history. */
  macrosAtLogTime: Macros;
}

export interface DailyLog {
  date: string;
  entries: LogEntry[];
  /** Cached/derived, recompute on any entry change. */
  totals: Macros;
}
