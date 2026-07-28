// §4.1 Profile & Body Data — the source of truth for these shapes is
// trajectory-app-technical-specification.md §4.1. Do not add fields here casually;
// `measurements` is deliberately open-ended so new body-measurement keys never require
// a schema change (see the comment inline).
//
// Note: this file and engine/engine.types.ts import each other's types (CheckIn embeds
// an EngineRequest/EngineResponse snapshot; EngineRequest embeds a UserProfile). That's a
// circular *type* import, which is fine under `isolatedModules` — interfaces are fully
// erased at compile time, so there's no runtime cycle, only a type-checking one that TS
// resolves lazily.
import type { EngineRequest, EngineResponse } from '../engine/engine.types';

export type Sex = 'male' | 'female';
export type GoalType = 'cut' | 'maintain' | 'bulk';

export interface Goal {
  type: GoalType;
  targetWeightKg?: number;
}

export interface UserProfile {
  id: string;
  sex: Sex;
  dateOfBirth: string; // ISO date
  heightCm: number;
  goal: Goal;
  /**
   * Open-ended: { waistCm: 80, hipCm: 95, ... }. Exact keys are the Engine's business,
   * not the UI's — the UI just renders whatever keys exist as editable fields (§9.12).
   */
  measurements: Record<string, number>;
  /** Free text, passed through to the Engine untouched. */
  activityNote?: string;
  /**
   * NOT in the original §4.1 table — added while building Part 4 (onboarding) to close a
   * gap the Engine's own code already flagged: engine/populationProfiles.ts's
   * checkExclusions() always raised `pregnancy_breastfeeding_status_unconfirmed` because
   * "there's no data field to confirm or deny pregnancy/breastfeeding status either way...
   * a future version that adds such a field to UserProfile should make this conditional."
   * This is that field. `undefined` preserves the original always-flagged behavior exactly
   * (existing callers/tests are unaffected); onboarding only asks the question at all when
   * `sex === 'female'`, and leaves it undefined if skipped.
   */
  pregnancyOrBreastfeedingStatus?: 'not_applicable' | 'pregnant' | 'breastfeeding';

  /**
   * NOT in the original §4.1 table — added while building Part 6 (Settings) to close a
   * gap Part 3's own report flagged directly: `engine/adaptiveTdeeEngine.ts`'s
   * `profileKind` always fell back to `'general'` because nothing ever threaded a real
   * value into `options.populationProfile` — there was no data field to source it from.
   * This is that field. `undefined` preserves the original always-`'general'` behavior
   * exactly (no existing caller or test changes behavior) — same additive shape as
   * `pregnancyOrBreastfeedingStatus` above, for the same reason, and the same
   * derive-inside-the-engine-rather-than-thread-through-every-call-site pattern (see
   * `adaptiveTdeeEngine.ts`'s `profileKind` line).
   */
  pharmacologicallyAssisted?: boolean;

  /**
   * NOT in the original §4.1 table — §9.12 (Settings) asks for a metric/imperial
   * toggle; this is where that preference lives. Purely a display/input-formatting
   * concern — every stored value in Dexie stays metric (kg/cm) regardless of this
   * field, exactly as §4 already specifies; changing it never touches or converts a
   * single stored value, only which unit Settings/Onboarding/Check-in *show* and
   * *accept input in* (see `lib/units.ts`). `undefined` defaults to metric, matching
   * every profile created before this field existed.
   */
  unitPreference?: 'metric' | 'imperial';
  createdAt: string;
  updatedAt: string;
}

export interface WeighIn {
  id: string;
  /** One per calendar day, upsert on duplicate. */
  date: string;
  weightKg: number;
  note?: string;
}

export interface CheckIn {
  id: string;
  date: string;
  measurements?: Record<string, number>;
  progressPhotoIds?: string[];
  /** Exact payload sent — never recomputed retroactively. */
  engineRequestSnapshot: EngineRequest;
  /** Exact payload received — never recomputed retroactively. */
  engineResponseSnapshot: EngineResponse;
}
