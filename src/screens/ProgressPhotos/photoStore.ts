// §9.11: "Timestamped photo storage (IndexedDB blobs)... simple side-by-side
// comparison view between any two dates." ProgressPhoto (types/media.ts) and the
// progressPhotos table already existed from Part 1 — this file is the read/write layer
// on top of them, following the same useLiveQuery-for-reads / plain-async-writes split
// as useHabits.ts and usePeriodEntries.ts.
import { db } from '../../data/db';
import type { ProgressPhoto } from '../../types';

/** Stores a photo Blob under `date` (defaults handled by the caller — see
 * PhotoCaptureSheet, which pre-fills today but lets it be edited for backdating an
 * imported photo). `checkInId` is for Part 4's future Check-In flow (§9.6) — a photo
 * captured as part of a check-in can be linked back to it; this screen's own capture
 * flow (PhotoCaptureSheet) never passes one, since every photo added from here is ad
 * hoc by definition (types/media.ts's own comment: "photos can also be added ad hoc
 * outside a check-in"). Returns the new photo's id. */
export async function addPhoto(
  date: string,
  blob: Blob,
  note?: string,
  checkInId?: string,
): Promise<string> {
  const photo: ProgressPhoto = { id: crypto.randomUUID(), date, blob, note, checkInId };
  await db.progressPhotos.add(photo);
  return photo.id;
}

export async function deletePhoto(id: string): Promise<void> {
  await db.progressPhotos.delete(id);
}

/** Every photo, oldest first. Display components decide their own order (PhotoGrid
 * shows newest-first, a typical gallery convention) — this just returns a stable,
 * unambiguous base ordering rather than Dexie's insertion-order default. */
export async function getAllPhotosSorted(): Promise<ProgressPhoto[]> {
  const photos = await db.progressPhotos.toArray();
  return photos.sort((a, b) => a.date.localeCompare(b.date));
}
