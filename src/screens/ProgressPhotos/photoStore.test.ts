import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../data/db';
import { addPhoto, deletePhoto, getAllPhotosSorted } from './photoStore';

describe('progress photo storage (Dexie-backed)', () => {
  beforeEach(async () => {
    await db.progressPhotos.clear();
  });

  it('stores a photo and returns its generated id', async () => {
    const blob = new Blob(['fake-image-bytes'], { type: 'image/jpeg' });
    const id = await addPhoto('2026-07-01', blob, 'front view');
    const stored = await db.progressPhotos.get(id);
    expect(stored).toBeDefined();
    expect(stored?.date).toBe('2026-07-01');
    expect(stored?.note).toBe('front view');
  });

  it('links a photo to a check-in when checkInId is provided (for Part 4 to use)', async () => {
    const id = await addPhoto('2026-07-01', new Blob(['x']), undefined, 'checkin-42');
    const stored = await db.progressPhotos.get(id);
    expect(stored?.checkInId).toBe('checkin-42');
  });

  it('leaves checkInId undefined for an ad hoc photo (this screen\'s own capture flow)', async () => {
    const id = await addPhoto('2026-07-01', new Blob(['x']));
    const stored = await db.progressPhotos.get(id);
    expect(stored?.checkInId).toBeUndefined();
  });

  it('round-trips the Blob itself, not just its metadata', async () => {
    // IndexedDB stores Blobs via structured clone — worth confirming fake-indexeddb
    // actually preserves blob content/type rather than silently degrading it, since
    // that's the one non-trivial data type this table (uniquely among this app's
    // tables) depends on.
    const original = new Blob(['hello progress photo'], { type: 'image/png' });
    const id = await addPhoto('2026-07-01', original);
    const stored = await db.progressPhotos.get(id);
    expect(stored?.blob).toBeInstanceOf(Blob);
    expect(stored?.blob.type).toBe('image/png');
    expect(stored?.blob.size).toBe(original.size);
    const text = await stored?.blob.text();
    expect(text).toBe('hello progress photo');
  });

  it('deletes a photo by id', async () => {
    const id = await addPhoto('2026-07-01', new Blob(['x']));
    await deletePhoto(id);
    expect(await db.progressPhotos.get(id)).toBeUndefined();
  });

  it('getAllPhotosSorted returns oldest first regardless of insertion order', async () => {
    await addPhoto('2026-07-10', new Blob(['c']));
    await addPhoto('2026-06-01', new Blob(['a']));
    await addPhoto('2026-06-15', new Blob(['b']));
    const sorted = await getAllPhotosSorted();
    expect(sorted.map((p) => p.date)).toEqual(['2026-06-01', '2026-06-15', '2026-07-10']);
  });

  it('returns an empty array when there are no photos', async () => {
    expect(await getAllPhotosSorted()).toEqual([]);
  });
});
