import type { LogEntry, FoodItem } from '../types';

export interface FrequentFoodItem {
  foodItem: FoodItem;
  logCount: number;
  lastLoggedAt: string;
}

/**
 * §9.2: "Recents & Favorites ... most-logged items first." Takes the full LogEntry
 * history (or any slice of it a caller wants to rank over) and a lookup of the
 * FoodItems it references, and returns items ranked by how often they've been logged,
 * ties broken by recency.
 *
 * Deliberately pure/synchronous — the caller is responsible for deciding how much
 * history to feed in (e.g. all-time vs. a trailing window) and for the Dexie reads
 * that produce `logEntries`/`foodItemsById`. Kept this way so the ranking rule itself
 * is unit-testable without touching IndexedDB.
 */
export function computeFrequentFoodItems(
  logEntries: LogEntry[],
  foodItemsById: Map<string, FoodItem>,
  limit = 10,
): FrequentFoodItem[] {
  const counts = new Map<string, { count: number; lastLoggedAt: string }>();
  for (const entry of logEntries) {
    const existing = counts.get(entry.foodItemId);
    if (existing) {
      existing.count += 1;
      if (entry.loggedAt > existing.lastLoggedAt) existing.lastLoggedAt = entry.loggedAt;
    } else {
      counts.set(entry.foodItemId, { count: 1, lastLoggedAt: entry.loggedAt });
    }
  }

  const ranked: FrequentFoodItem[] = [];
  for (const [foodItemId, agg] of counts) {
    const foodItem = foodItemsById.get(foodItemId);
    // A log entry can outlive the food item it referenced (e.g. a custom food the user
    // later deleted) — LogEntry.macrosAtLogTime (§4.3) means history stays accurate even
    // then, but there's nothing to show in a *food picker* for an item that no longer
    // resolves, so skip it here rather than rendering a broken row.
    if (!foodItem) continue;
    ranked.push({ foodItem, logCount: agg.count, lastLoggedAt: agg.lastLoggedAt });
  }

  ranked.sort((a, b) => {
    if (b.logCount !== a.logCount) return b.logCount - a.logCount;
    return b.lastLoggedAt.localeCompare(a.lastLoggedAt);
  });

  return ranked.slice(0, limit);
}
