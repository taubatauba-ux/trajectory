// §4.5 Habits, Period, Sync Metadata. Source of truth:
// trajectory-app-technical-specification.md §4.5.

export interface HabitDefinition {
  id: string;
  name: string;
  icon?: string;
  active: boolean;
}

export interface HabitEntry {
  id: string;
  habitId: string;
  date: string;
  completed: boolean;
}

export type PeriodFlow = 'spotting' | 'light' | 'medium' | 'heavy';

export interface PeriodEntry {
  id: string;
  date: string;
  flow?: PeriodFlow;
  symptoms?: string[];
}

export interface SyncMeta {
  /** Timestamp of last successful OFF sync. */
  offDatasetVersion: string;
  lastDeltaAppliedDate: string;
  /** Extraction date — static, changes only if re-extracted. */
  icmrDatasetVersion: string;
}
