// Bridges a spec gap found while building Part 4: both §9.1 ("response stored as the
// first `TargetPlan`") and §9.6 ("new `TargetPlan` shown...") name a `TargetPlan` type,
// but no such type is defined anywhere in §4's data model (the spec's own stated source
// of truth for shapes) or in src/types/. It isn't a new persisted concept — `CheckIn`
// (§4.1, already in db.ts) already carries exactly this shape: a date, optional
// measurements/photos, and an engineRequestSnapshot/engineResponseSnapshot pair. This
// build's decision: "TargetPlan" is the spec's informal name for "the latest
// EngineResponse the user has seen," and that's simply the most recent CheckIn.
// Onboarding (§9.1) creates the first one; Check-in (§9.6) appends every one after.
// This keeps the data model exactly as documented — no new Dexie table, no schema
// version bump — rather than inventing a type the spec's own source-of-truth section
// doesn't have.
import { db } from './db';
import { newId } from './id';
import type { CheckIn } from '../types/profile';
import type { EngineRequest, EngineResponse } from '../engine/engine.types';

/** Most recent CheckIn by date, or undefined before onboarding has ever run. checkIns is
 * expected to stay small (roughly one row per check-in cadence, §1.3's
 * CHECK_IN_CADENCE_DAYS), so a full sorted read is fine — no need for a narrower index
 * query. */
export async function getLatestCheckIn(): Promise<CheckIn | undefined> {
  const all = await db.checkIns.orderBy('date').toArray();
  return all[all.length - 1];
}

export interface CreateCheckInInput {
  /** Optional pre-generated id — lets a caller create a ProgressPhoto with
   * `checkInId` set to this same value *before* the CheckIn row exists yet (Check-in's
   * flow does exactly this: photo first, then the CheckIn that references it).
   * Generated internally via newId() if omitted. */
  id?: string;
  date: string;
  measurements?: Record<string, number>;
  progressPhotoIds?: string[];
  /** Exact payload sent — never recomputed retroactively (§4.1's own comment on CheckIn). */
  engineRequestSnapshot: EngineRequest;
  /** Exact payload received — never recomputed retroactively. */
  engineResponseSnapshot: EngineResponse;
}

/** Used identically by Onboarding (the first CheckIn) and the Check-in flow (every one
 * after) — there's nothing structurally special about "the first one," which is exactly
 * why treating onboarding's callEngine() result as check-in zero is a clean bridge rather
 * than a special case. */
export async function createCheckIn(input: CreateCheckInInput): Promise<CheckIn> {
  const { id, ...rest } = input;
  const checkIn: CheckIn = { id: id ?? newId(), ...rest };
  await db.checkIns.put(checkIn);
  return checkIn;
}

/** Convenience for any screen that just wants "what are today's targets" without needing
 * to know a CheckIn is where that lives — e.g. Part 3's Dashboard. Returns undefined only
 * before onboarding has ever completed. */
export async function getCurrentTargets(): Promise<EngineResponse | undefined> {
  const latest = await getLatestCheckIn();
  return latest?.engineResponseSnapshot;
}

/**
 * Pure predicate: is a check-in due? §9.6: "Triggered when EngineResponse.nextCheckIn is
 * today or past." `nextCheckIn: null` means the Engine hasn't decided yet (§1.3) — not
 * due. No prior CheckIn (pre-onboarding) — not due; onboarding itself isn't gated by this.
 * Exported for Part 3's Dashboard banner to call directly rather than re-deriving this
 * comparison itself.
 */
export function isCheckInDue(latestCheckIn: CheckIn | undefined, today: string): boolean {
  const nextCheckIn = latestCheckIn?.engineResponseSnapshot.nextCheckIn;
  if (!nextCheckIn) return false;
  return today >= nextCheckIn;
}
