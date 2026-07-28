import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { buildDataExport, exportAllDataAsJson, exportedPhotoToBlob } from './dataExport';

afterEach(async () => {
  await Promise.all([
    db.profile.clear(),
    db.weighIns.clear(),
    db.checkIns.clear(),
    db.foodItems.clear(),
    db.logEntries.clear(),
    db.habitDefinitions.clear(),
    db.habitEntries.clear(),
    db.periodEntries.clear(),
    db.progressPhotos.clear(),
    db.syncMeta.clear(),
    db.favorites.clear(),
  ]);
});

describe('buildDataExport', () => {
  it('returns an empty-but-well-formed bundle for a fresh, unused database', async () => {
    const bundle = await buildDataExport();
    expect(bundle.exportFormatVersion).toBe(1);
    expect(bundle.profile).toEqual([]);
    expect(bundle.weighIns).toEqual([]);
    expect(bundle.progressPhotos).toEqual([]);
    expect(bundle.syncMeta).toEqual([]);
    expect(new Date(bundle.exportedAt).toString()).not.toBe('Invalid Date');
  });

  it('includes every table with real rows in it', async () => {
    await db.weighIns.put({ id: 'w1', date: '2026-07-01', weightKg: 82 });
    await db.favorites.put({ id: 'fav1', foodItemId: 'f1', gramsDefault: 150, pinnedAt: '2026-07-01T00:00:00Z' });
    await db.syncMeta.put({
      id: 'singleton',
      offDatasetVersion: '2026-07-01',
      lastDeltaAppliedDate: '2026-07-01',
      icmrDatasetVersion: '2026-01-01',
    });

    const bundle = await buildDataExport();
    expect(bundle.weighIns).toHaveLength(1);
    expect(bundle.weighIns[0]).toMatchObject({ id: 'w1', weightKg: 82 });
    expect(bundle.favorites).toHaveLength(1);
    // the Dexie-internal 'id: singleton' wrapper is stripped back to plain SyncMeta
    expect(bundle.syncMeta).toEqual([
      { offDatasetVersion: '2026-07-01', lastDeltaAppliedDate: '2026-07-01', icmrDatasetVersion: '2026-01-01' },
    ]);
  });

  it('round-trips a photo blob through base64 without corruption', async () => {
    const originalBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 255]); // PNG-ish header + junk
    const blob = new Blob([originalBytes], { type: 'image/png' });
    await db.progressPhotos.put({ id: 'p1', date: '2026-07-01', blob, note: 'front' });

    const bundle = await buildDataExport();
    expect(bundle.progressPhotos).toHaveLength(1);
    const exported = bundle.progressPhotos[0]!;
    expect(exported.blobType).toBe('image/png');
    expect(exported.note).toBe('front');

    const restored = exportedPhotoToBlob(exported);
    const restoredBytes = new Uint8Array(await restored.arrayBuffer());
    expect(Array.from(restoredBytes)).toEqual(Array.from(originalBytes));
    expect(restored.type).toBe('image/png');
  });

  it('serializes to valid, parseable JSON containing everything', async () => {
    await db.weighIns.put({ id: 'w1', date: '2026-07-01', weightKg: 82 });
    const json = await exportAllDataAsJson();
    const parsed = JSON.parse(json);
    expect(parsed.weighIns).toHaveLength(1);
    expect(parsed.exportFormatVersion).toBe(1);
  });
});
