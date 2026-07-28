import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../data/db';
import type { FoodItem } from '../types/food';
import { isICMRFoodItem, isOFFFoodItem, isCustomFoodItem } from '../types/food';
import { buildICMRIndex, buildOFFIndex, buildCustomIndex } from './fuzzyIndex';
import { createUnifiedSearch, DEFAULT_DISPLAY_CAP, type RankedSearchResult } from './unifiedSearch';
import { searchOffLive } from './offLiveSearch';

/**
 * Integration-layer adapter around Part 2's `createUnifiedSearch` controller (§8).
 * Part 2 built the algorithm (debounced, two-phase local→live, ranked/merged); Part 3
 * and Part 4 each independently built a screen that expected to consume it as a plain
 * `(query) => Promise<FoodItem[]>` function (see localFoodSearchFallback.ts and
 * localIngredientSearch.ts, both since removed) — neither guess was quite right, because
 * the real controller is callback-based and stateful (a debounce timer + cancellation
 * token), not a single Promise. This hook is the missing seam: it builds the three Fuse
 * indexes reactively from `db.foodItems`, wires the one live-network dependency to
 * `searchOffLive`, and exposes the two-phase result stream as a single `results` array
 * that updates up to twice per query — once immediately with local matches (§8 step 1),
 * and again if/when live OFF results settle and get merged in (§8 step 3).
 *
 * Indexes are rebuilt only when the underlying catalog changes (via `useLiveQuery`), not
 * on every keystroke — rebuilding a Fuse index is the expensive part; searching it is
 * cheap. Any in-flight controller work is cancelled on query change and on unmount, so a
 * slow live fetch from an abandoned query can never clobber a newer one's results.
 */
export function useUnifiedSearch(query: string): { results: FoodItem[]; isSearching: boolean } {
  const allItems = useLiveQuery(() => db.foodItems.toArray());

  const indexes = useMemo(() => {
    const items = allItems ?? [];
    return {
      icmrIndex: buildICMRIndex(items.filter(isICMRFoodItem)),
      offCacheIndex: buildOFFIndex(items.filter(isOFFFoodItem)),
      customIndex: buildCustomIndex(items.filter(isCustomFoodItem)),
    };
  }, [allItems]);

  const controllerRef = useRef(createUnifiedSearch({ ...indexes, liveSearch: searchOffLive }));
  const [results, setResults] = useState<FoodItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Rebuilt whenever the catalog changes so a stale Fuse instance is never searched.
  // Safe to replace outright: createUnifiedSearch's only internal state (pending
  // timer/token) is scoped to in-flight queries, nothing accumulates across instances.
  useEffect(() => {
    controllerRef.current.cancel();
    controllerRef.current = createUnifiedSearch({ ...indexes, liveSearch: searchOffLive });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexes]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      controllerRef.current.cancel();
      setResults([]);
      setIsSearching(false);
      return;
    }

    const toFoodItems = (ranked: RankedSearchResult[]): FoodItem[] =>
      ranked.slice(0, DEFAULT_DISPLAY_CAP).map((r) => r.item);

    setIsSearching(true);
    controllerRef.current
      .search(query, {
        onLocalResults: (local) => setResults(toFoodItems(local)),
        onLiveResults: (combined) => setResults(toFoodItems(combined)),
      })
      .then(() => setIsSearching(false));

    return () => controllerRef.current.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, indexes]);

  return { results, isSearching };
}
