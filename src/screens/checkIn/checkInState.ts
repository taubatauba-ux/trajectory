export interface CheckInState {
  weightKg: string;
  /** Only ever contains keys that were already present in UserProfile.measurements at
   * the start of this flow (§9.6: "only the keys present in UserProfile.measurements") —
   * this step never introduces a new key, that's Settings/Profile territory (§9.12),
   * not Check-in's. */
  measurementUpdates: Record<string, string>;
  photoBlob: Blob | null;
}

export function isPositiveNumber(s: string): boolean {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) && n > 0;
}

export function canProceedFromWeighIn(state: CheckInState): boolean {
  return isPositiveNumber(state.weightKg);
}

/** Every measurement row is optional to actually change — leaving a field as its
 * pre-filled value (or blank, if the profile somehow had no number for a key it still
 * lists) is fine; the only failure is typing something that isn't a valid positive
 * number into a field that has SOME text in it. */
export function canProceedFromMeasurements(state: CheckInState): boolean {
  return Object.values(state.measurementUpdates).every((v) => v.trim() === '' || isPositiveNumber(v));
}
