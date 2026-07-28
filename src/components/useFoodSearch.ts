import { useEffect, useRef, useState } from 'react';
import type { FoodItem } from '../types';

/**
 * Fires `searchFn` on every query change — deliberately no artificial debounce here.
 * §8's local-results step is meant to render "instantly" (well under 100ms); any
 * live-network portion is the search implementation's own internal concern (§8 step 2
 * debounces that specifically), not something this hook should impose uniformly on
 * every call. What this hook does own: ignoring a stale response if a newer keystroke's
 * request has already landed, via a simple incrementing token compared on resolution.
 *
 * `searchFn` should be a stable reference (a module-level function, not a fresh closure
 * per render) — it's a dependency of the effect below.
 */
export function useFoodSearch(
  query: string,
  searchFn: (query: string) => Promise<FoodItem[]>,
): { results: FoodItem[]; isSearching: boolean } {
  const [results, setResults] = useState<FoodItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      requestId.current += 1; // invalidate any in-flight request from a longer query
      setResults([]);
      setIsSearching(false);
      return;
    }

    const thisRequest = ++requestId.current;
    setIsSearching(true);
    searchFn(query)
      .then((found) => {
        if (requestId.current === thisRequest) {
          setResults(found);
          setIsSearching(false);
        }
      })
      .catch(() => {
        if (requestId.current === thisRequest) {
          setResults([]);
          setIsSearching(false);
        }
      });
  }, [query, searchFn]);

  return { results, isSearching };
}
