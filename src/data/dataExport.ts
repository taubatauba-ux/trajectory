import { db } from './db';
import type {
  UserProfile,
  WeighIn,
  CheckIn,
  FoodItem,
  LogEntry,
  HabitDefinition,
  HabitEntry,
  PeriodEntry,
  SyncMeta,
  Favorite,
} from '../types';

/** A ProgressPhoto with its Blob swapped for a base64 string — JSON has no binary
 * type, and §9.12/§13 ask for "full JSON dump of everything," photos included, not
 * everything-except-photos. */
export interface ExportedProgressPhoto {
  id: string;
  date: string;
  checkInId?: string;
  note?: string;
  blobType: string;
  blobBase64: string;
}

export interface DataExportBundle {
  exportedAt: string;
  /** Bumped only if a future export's shape stops being read the same way by whatever
   * imports it back in — not tied to the Dexie schema version, which can change
   * (new tables, e.g.) without the export format itself needing to. */
  exportFormatVersion: 1;
  profile: UserProfile[];
  weighIns: WeighIn[];
  checkIns: CheckIn[];
  foodItems: FoodItem[];
  logEntries: LogEntry[];
  habitDefinitions: HabitDefinition[];
  habitEntries: HabitEntry[];
  periodEntries: PeriodEntry[];
  progressPhotos: ExportedProgressPhoto[];
  syncMeta: SyncMeta[];
  favorites: Favorite[];
}

/** `Blob.arrayBuffer()` + manual base64, rather than `FileReader.readAsDataURL` — both
 * work, but this stays a plain async function (no event-callback wrapping needed) and
 * behaves identically under jsdom in tests as it does in a real browser. */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type });
}

/** Every Dexie table, no filtering — this is a backup/portability export (§13: "the
 * user is never locked in"), not a report, so partial data would defeat the point. */
export async function buildDataExport(): Promise<DataExportBundle> {
  const [
    profile,
    weighIns,
    checkIns,
    foodItems,
    logEntries,
    habitDefinitions,
    habitEntries,
    periodEntries,
    rawPhotos,
    syncMetaRow,
    favorites,
  ] = await Promise.all([
    db.profile.toArray(),
    db.weighIns.toArray(),
    db.checkIns.toArray(),
    db.foodItems.toArray(),
    db.logEntries.toArray(),
    db.habitDefinitions.toArray(),
    db.habitEntries.toArray(),
    db.periodEntries.toArray(),
    db.progressPhotos.toArray(),
    db.syncMeta.toArray(),
    db.favorites.toArray(),
  ]);

  const progressPhotos = await Promise.all(
    rawPhotos.map(
      async (p): Promise<ExportedProgressPhoto> => ({
        id: p.id,
        date: p.date,
        checkInId: p.checkInId,
        note: p.note,
        blobType: p.blob.type || 'image/jpeg',
        blobBase64: await blobToBase64(p.blob),
      }),
    ),
  );

  // syncMeta is Dexie's singleton-row-with-an-id-field internally (db.ts) — strip the
  // 'id' back out so this matches the plain SyncMeta shape (§4.5) everywhere else in
  // the export, rather than leaking that storage detail into the export format.
  const syncMeta: SyncMeta[] = syncMetaRow.map(({ id: _id, ...meta }) => meta);

  return {
    exportedAt: new Date().toISOString(),
    exportFormatVersion: 1,
    profile,
    weighIns,
    checkIns,
    foodItems,
    logEntries,
    habitDefinitions,
    habitEntries,
    periodEntries,
    progressPhotos,
    syncMeta,
    favorites,
  };
}

export async function exportAllDataAsJson(): Promise<string> {
  const bundle = await buildDataExport();
  return JSON.stringify(bundle, null, 2);
}

/** Inverse of `blobToBase64`, for anything that reads an export bundle back in later —
 * not wired to an "import" UI action yet (§9.12 only asks for export), kept alongside
 * its counterpart since a round-trip pair belongs in the same file. */
export function exportedPhotoToBlob(photo: ExportedProgressPhoto): Blob {
  return base64ToBlob(photo.blobBase64, photo.blobType);
}

/** Browser-only: triggers a file download via an in-memory Blob URL. Thin and
 * deliberately untested, matching HistoryTrends/csvExport.ts's own downloadCsv — no
 * meaningful logic to test, it's DOM API calls in sequence. exportAllDataAsJson and
 * buildDataExport above carry the actual logic and are what's unit tested. */
export function downloadJson(filename: string, jsonContent: string): void {
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
