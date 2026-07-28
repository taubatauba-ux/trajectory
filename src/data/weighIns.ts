// WeighIn.date's own doc comment (§4.1): "One per calendar day, upsert on duplicate."
// The Dexie schema indexes `date` for querying but `id` is the primary key — Dexie
// doesn't enforce one-row-per-date on its own, so that convention is an
// application-level rule. This is the one place it's implemented, used by both
// Onboarding (the first weigh-in) and Check-in (every one after) so the rule can't
// drift between the two call sites.
import { db } from './db';
import { newId } from './id';
import type { WeighIn } from '../types/profile';

export async function upsertWeighInForDate(date: string, weightKg: number, note?: string): Promise<WeighIn> {
  const existing = await db.weighIns.where('date').equals(date).first();
  const weighIn: WeighIn = {
    id: existing?.id ?? newId(),
    date,
    weightKg,
    ...(note !== undefined ? { note } : {}),
  };
  await db.weighIns.put(weighIn);
  return weighIn;
}
