// Not an explicit interface in trajectory-app-technical-specification.md — inferred
// from two places that assume it exists: CheckIn.progressPhotoIds (§4.1) and the
// Progress Photos screen (§9.11). IndexedDB (Dexie's backing store) can hold Blobs
// natively, so photos live entirely client-side, same as everything else in the app —
// no upload step, no server.
export interface ProgressPhoto {
  id: string;
  date: string;
  blob: Blob;
  /** Optional link back to the CheckIn this was captured during, if any — photos can
   * also be added ad hoc outside a check-in. */
  checkInId?: string;
  note?: string;
}
