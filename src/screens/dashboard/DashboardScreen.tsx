import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Navigate } from 'react-router-dom';
import { db, getProfile, addFavorite, removeFavorite } from '../../data/db';
import { seedDemoFoodDataIfEmpty } from '../../data/seedDemoFoodData';
import { getLatestCheckIn, isCheckInDue } from '../../data/checkIns';
import { callEngine } from '../../engine/callEngine';
import type { EngineResponse } from '../../engine/engine.types';
import { buildEngineRequest } from '../../engine/buildEngineRequest';
import type { FoodItem, LogEntry, WeighIn, Favorite } from '../../types';
import { todayISO } from '../../lib/dateUtils';
import { sumMacrosList, scaleMacros } from '../../lib/macros';
import { computeFrequentFoodItems } from '../../lib/recents';
import { useUnifiedSearch } from '../../search/useUnifiedSearch';
import { SearchBar } from '../../components/SearchBar';
import { SearchResultRow } from '../../components/SearchResultRow';
import { Toast } from '../../components/Toast';
import { TodaySummary } from './TodaySummary';
import { EngineFlagsBadges } from './EngineFlagsBadges';
import { QuickWeighIn } from './QuickWeighIn';
import { TimelineLog } from './TimelineLog';
import { RecentsAndFavorites, type FavoriteWithItem } from './RecentsAndFavorites';
import { CheckInBanner } from './CheckInBanner';
import { HabitStrip } from '../HabitTracker/HabitStrip';

// Distinct from `undefined` (which useLiveQuery also returns while a real query is
// legitimately still resolving), so "no profile loaded yet" and "confirmed no profile
// exists" don't collapse into the same case — the second one should redirect to
// onboarding, the first one very much should not.
const LOADING = 'loading' as const;

export default function DashboardScreen() {
  const profile = useLiveQuery(() => getProfile(), [], LOADING);
  const weighIns = useLiveQuery(() => db.weighIns.toArray(), [], [] as WeighIn[]);
  const logEntries = useLiveQuery(() => db.logEntries.toArray(), [], [] as LogEntry[]);
  const foodItems = useLiveQuery(() => db.foodItems.toArray(), [], [] as FoodItem[]);
  const favorites = useLiveQuery(() => db.favorites.toArray(), [], [] as Favorite[]);
  const latestCheckIn = useLiveQuery(() => getLatestCheckIn());

  const [engineResponse, setEngineResponse] = useState<EngineResponse | null>(null);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<{ message: string; undo: () => void } | null>(null);

  const { results: searchResults } = useUnifiedSearch(query);

  // Illustrative catalog only — no-ops the moment real data exists. See
  // data/seedDemoFoodData.ts's header comment.
  useEffect(() => {
    seedDemoFoodDataIfEmpty();
  }, []);

  // Recomputes on profile/weigh-in/log changes. Re-running on every logEntries change
  // looks wasteful at first glance, but buildEngineRequest always excludes *today* from
  // the payload (see its header comment), so a same-day log edit produces an identical
  // EngineRequest and therefore an identical (cheap, deterministic) response — no
  // visible jitter, just a harmless redundant recompute. It's also what correctly
  // handles useLiveQuery's data still loading in in this effect's first render(s).
  useEffect(() => {
    if (profile === LOADING || !profile) return;
    let cancelled = false;
    (async () => {
      const req = buildEngineRequest(profile, weighIns, logEntries);
      const response = await callEngine(req);
      if (!cancelled) setEngineResponse(response);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, weighIns, logEntries]);

  const foodItemsById = useMemo(() => new Map(foodItems.map((f) => [f.id, f])), [foodItems]);
  const favoriteFoodItemIds = useMemo(() => new Set(favorites.map((f) => f.foodItemId)), [favorites]);

  const favoritesWithItems: FavoriteWithItem[] = useMemo(() => {
    const withItems: FavoriteWithItem[] = [];
    for (const fav of [...favorites].sort((a, b) => b.pinnedAt.localeCompare(a.pinnedAt))) {
      const foodItem = foodItemsById.get(fav.foodItemId);
      if (foodItem) withItems.push({ foodItem, gramsDefault: fav.gramsDefault });
    }
    return withItems;
  }, [favorites, foodItemsById]);

  const today = todayISO();

  const todayEntries = useMemo(
    () =>
      logEntries
        .filter((e) => e.date === today)
        .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt)),
    [logEntries, today],
  );
  const consumed = useMemo(() => sumMacrosList(todayEntries.map((e) => e.macrosAtLogTime)), [todayEntries]);
  const todayWeighIn = useMemo(() => weighIns.find((w) => w.date === today), [weighIns, today]);
  const frequent = useMemo(
    () => computeFrequentFoodItems(logEntries, foodItemsById, 12),
    [logEntries, foodItemsById],
  );

  const handleLog = useCallback(
    (item: FoodItem, grams: number) => {
      const entry: LogEntry = {
        id: crypto.randomUUID(),
        date: today,
        loggedAt: new Date().toISOString(),
        foodItemId: item.id,
        grams,
        macrosAtLogTime: scaleMacros(item.per100g, grams),
      };
      void db.logEntries.put(entry);
      setToast({
        message: `Added ${item.displayName}`,
        undo: () => {
          void db.logEntries.delete(entry.id);
        },
      });
    },
    [today],
  );

  const handleDeleteEntry = useCallback((entry: LogEntry) => {
    void db.logEntries.delete(entry.id);
  }, []);

  const handleUpdateGrams = useCallback((entry: LogEntry, food: FoodItem, newGrams: number) => {
    void db.logEntries.put({ ...entry, grams: newGrams, macrosAtLogTime: scaleMacros(food.per100g, newGrams) });
  }, []);

  const handleToggleFavorite = useCallback(
    (item: FoodItem, currentDefaultGrams: number) => {
      if (favoriteFoodItemIds.has(item.id)) {
        void removeFavorite(item.id);
      } else {
        void addFavorite(item.id, currentDefaultGrams);
      }
    },
    [favoriteFoodItemIds],
  );

  const handleSaveWeighIn = useCallback(
    (weightKg: number) => {
      void db.weighIns.put({ id: todayWeighIn?.id ?? crypto.randomUUID(), date: today, weightKg });
    },
    [todayWeighIn, today],
  );

  if (profile === LOADING) {
    return null; // brief first-load flash — Dexie reads are local and fast
  }
  if (!profile) {
    return <Navigate to="/onboarding" replace />;
  }

  const showSearchResults = query.trim().length >= 2;
  const checkInDue = isCheckInDue(latestCheckIn, today);

  return (
    <div className="pb-24">
      {engineResponse && (
        <>
          <TodaySummary consumed={consumed} target={engineResponse.targets} />
          <EngineFlagsBadges flags={engineResponse.flags ?? []} note={engineResponse.note} />
        </>
      )}

      <CheckInBanner due={checkInDue} />
      <QuickWeighIn
        existingWeightKg={todayWeighIn?.weightKg}
        onSave={handleSaveWeighIn}
        unitPreference={profile.unitPreference ?? 'metric'}
      />
      <div className="px-4">
        <HabitStrip />
      </div>

      <div className="px-4 py-3">
        <SearchBar value={query} onChange={setQuery} />
      </div>

      {showSearchResults ? (
        searchResults.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-ink-muted">No matches for &ldquo;{query}&rdquo;.</div>
        ) : (
          <div>
            {searchResults.map((item) => (
              <SearchResultRow
                key={item.id}
                item={item}
                isFavorite={favoriteFoodItemIds.has(item.id)}
                onLog={handleLog}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>
        )
      ) : (
        <RecentsAndFavorites
          favorites={favoritesWithItems}
          frequent={frequent}
          favoriteFoodItemIds={favoriteFoodItemIds}
          onLog={handleLog}
          onToggleFavorite={handleToggleFavorite}
        />
      )}

      <div className="mt-2">
        <div className="px-4 pb-1.5 pt-4 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          Today
        </div>
        <TimelineLog
          entries={todayEntries}
          foodItemsById={foodItemsById}
          onDelete={handleDeleteEntry}
          onUpdateGrams={handleUpdateGrams}
        />
      </div>

      {toast && (
        <Toast message={toast.message} actionLabel="Undo" onAction={toast.undo} onDismiss={() => setToast(null)} />
      )}
    </div>
  );
}
