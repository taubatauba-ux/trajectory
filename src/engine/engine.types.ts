// §1.3 The Engine contract. Source of truth: trajectory-app-technical-specification.md
// §1.3. KEEP THIS STABLE — everything else in the app can change freely, but this file
// is the only seam between the app and the Engine (real or stub). If you're tempted to
// add trend-smoothing, TDEE back-calculation, or adjustment logic to the app itself
// (outside src/engine/), stop — that logic belongs inside whatever implements
// EngineResponse below, never in a screen or component.
import type { UserProfile, WeighIn } from '../types/profile';
import type { Macros } from '../types/food';

export interface EngineRequest {
  profile: UserProfile;
  history: {
    /** Every daily weigh-in on record. */
    weighIns: WeighIn[];
    /** One aggregate per day. */
    dailyLogs: { date: string; totals: Macros }[];
  };
}

export interface EngineResponse {
  /** Today's kcal/protein/carb/fat(/fiber). */
  targets: Macros;
  /** ISO date. */
  effectiveFrom: string;
  /** ISO date; null = Engine hasn't decided yet. */
  nextCheckIn: string | null;
  /** Optional human-readable explanation, shown verbatim in UI. */
  note?: string;
  /** Optional, e.g. ["insufficient_data"], UI shows a small badge. */
  flags?: string[];
}
