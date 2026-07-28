// Dexie schema. The spec (trajectory-app-technical-specification.md §4) gives the
// TypeScript shapes; it doesn't prescribe literal Dexie table/index definitions, so this
// file is an implementation decision, not a transcription. Everything lives client-side
// in IndexedDB — no server, no sync target other than the OFF cache refresh (§6.2) and
// the user's own device backup/restore (§9.12).
//
// Index choices, briefly:
//  - `date` is indexed on every date-bearing table because almost every screen queries
//    "give me everything on/around date X" (Dashboard §9.2, History §9.8, Habit Tracker
//    §9.9, Period Tracker §9.10).
//  - foodItems indexes `source` (search filters by it, §8) and the two natural lookup
//    keys per source (`ifctCode` for ICMR, `barcode`+`offId` for OFF) so barcode scans
//    and re-sync don't table-scan.
//  - habitEntries has a compound [habitId+date] index since "did I do X today" and "X's
//    full history" are the two access patterns (§9.9), and a plain `date` index for "all
//    habits today" on the Dashboard.
import Dexie, { type EntityTable } from 'dexie';
import type {
  UserProfile,
  WeighIn,
  CheckIn,
  FoodItem,
  LogEntry,
  HabitDefinition,
  HabitEntry,
  PeriodEntry,
  ProgressPhoto,
  SyncMeta,
  Favorite,
} from '../types';

export class TrajectoryDB extends Dexie {
  profile!: EntityTable<UserProfile, 'id'>;
  weighIns!: EntityTable<WeighIn, 'id'>;
  checkIns!: EntityTable<CheckIn, 'id'>;
  foodItems!: EntityTable<FoodItem, 'id'>;
  logEntries!: EntityTable<LogEntry, 'id'>;
  habitDefinitions!: EntityTable<HabitDefinition, 'id'>;
  habitEntries!: EntityTable<HabitEntry, 'id'>;
  periodEntries!: EntityTable<PeriodEntry, 'id'>;
  progressPhotos!: EntityTable<ProgressPhoto, 'id'>;
  /** Single-row table; always read/write the row with id 'singleton'. */
  syncMeta!: EntityTable<SyncMeta & { id: 'singleton' }, 'id'>;
  /** Part 3 addition — see types/favorites.ts for why this is its own table. */
  favorites!: EntityTable<Favorite, 'id'>;

  constructor() {
    super('trajectory');
    this.version(1).stores({
      profile: 'id',
      weighIns: 'id, date',
      checkIns: 'id, date',
      foodItems: 'id, source, displayName, ifctCode, barcode, offId',
      logEntries: 'id, date, foodItemId, loggedAt',
      habitDefinitions: 'id, active',
      habitEntries: 'id, date, habitId, [habitId+date]',
      periodEntries: 'id, date',
      progressPhotos: 'id, date, checkInId',
      syncMeta: 'id',
    });
    // v2 (Part 3): adds `favorites` only — every other table is carried forward
    // unchanged. Verified empirically (throwaway fake-indexeddb script, not just assumed
    // from Dexie's docs) that Dexie does NOT require re-declaring untouched tables in a
    // later .stores() call, and that a real "existing install gets updated" upgrade path
    // preserves all prior data. `foodItemId` is indexed for the pin/unpin toggle's "is
    // this item already a favorite" lookup; `pinnedAt` for "most recently pinned first".
    this.version(2).stores({
      favorites: 'id, foodItemId, pinnedAt',
    });
  }
}

/**
 * Single shared instance, per Dexie's own recommended usage pattern (one DB instance
 * per database per tab). Import this, don't `new TrajectoryDB()` a second time.
 */
export const db = new TrajectoryDB();

/** Convenience accessor — most callers want "the profile" (there's exactly one), not
 * "look up a profile by id" as if there could be several. */
export async function getProfile(): Promise<UserProfile | undefined> {
  return db.profile.toCollection().first();
}

/** Settings' (§9.12) save action — preserves `id`/`createdAt` from the existing
 * profile, only ever bumping `updatedAt`. Onboarding writes the *first* profile
 * directly via `db.profile.put()` (it's creating one, not editing one, and has no
 * prior `id`/`createdAt` to preserve); this is specifically for editing an existing
 * profile afterward, which is every other write from here on. */
export async function updateProfile(
  existing: UserProfile,
  patch: Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<UserProfile> {
  const updated: UserProfile = {
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await db.profile.put(updated);
  return updated;
}

export async function getSyncMeta(): Promise<SyncMeta | undefined> {
  const row = await db.syncMeta.get('singleton');
  if (!row) return undefined;
  const { id: _id, ...meta } = row;
  return meta;
}

export async function setSyncMeta(meta: SyncMeta): Promise<void> {
  await db.syncMeta.put({ ...meta, id: 'singleton' });
}

// --- Favorites (Part 3 addition — see types/favorites.ts) --------------------------

export async function isFavorited(foodItemId: string): Promise<boolean> {
  const existing = await db.favorites.where('foodItemId').equals(foodItemId).first();
  return existing !== undefined;
}

/** Pins a food as a favorite with a remembered gram amount (§9.2). Idempotent by
 * foodItemId — pinning an already-favorited item just updates its remembered amount
 * and bumps it to the top of "most recently pinned" rather than creating a duplicate. */
export async function addFavorite(foodItemId: string, gramsDefault: number): Promise<void> {
  const existing = await db.favorites.where('foodItemId').equals(foodItemId).first();
  const favorite: Favorite = {
    id: existing?.id ?? crypto.randomUUID(),
    foodItemId,
    gramsDefault,
    pinnedAt: new Date().toISOString(),
  };
  await db.favorites.put(favorite);
}

export async function removeFavorite(foodItemId: string): Promise<void> {
  await db.favorites.where('foodItemId').equals(foodItemId).delete();
}
