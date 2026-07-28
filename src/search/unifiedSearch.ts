// §8 Unified Search & Ranking Algorithm — orchestrates fuzzyIndex.ts (local matching)
// and offLiveSearch.ts (the one network call in this module) into the three-source,
// debounced, ranked search the spec describes. Everything here is pure/synchronous
// except `createUnifiedSearch`'s debounce timer — kept that way deliberately so the
// ranking logic itself (the part most likely to need tuning later) is trivially unit
// testable without touching fake timers at all.
import type Fuse from 'fuse.js';
import type { ICMRFoodItem, OFFFoodItem, CustomFoodItem, FoodItem } from '../types/food';
import { fuzzySearch, type FuzzyMatch } from './fuzzyIndex';

export type MatchTier = 'exact' | 'icmr' | 'custom' | 'off_cached' | 'off_live';

/** One food in a ranked result list. Every result carries `source` at the top level
 * (§9.3: "every result carries its source for the UI tag") even though it's technically
 * re-derivable from `item.source` — duplicating it here is a small, deliberate
 * convenience for the UI code that will eventually render the source tag, not a
 * normalization slip. */
export interface RankedSearchResult {
  item: FoodItem;
  source: FoodItem['source'];
  tier: MatchTier;
  /** Meaningful only as a *within-tier* sort key — see fuzzyIndex.ts's FuzzyMatch doc
   * comment, and assignLiveConfidence below for why off_live's values are synthetic. */
  confidence: number;
}

export interface SourceMatches {
  icmr: FuzzyMatch<ICMRFoodItem>[];
  custom: FuzzyMatch<CustomFoodItem>[];
  offCache: FuzzyMatch<OFFFoodItem>[];
  /** Absent (not just `[]`) when live search hasn't run yet for this query — kept
   * distinct so `rankAndMerge` can be called once for §8 step 1's immediate local
   * render and again for step 3's combined render, from the same call site, without an
   * empty array lying about "live search ran and found nothing". */
  live?: FuzzyMatch<OFFFoodItem>[];
}

const MIN_QUERY_LENGTH = 2; // §8: "if length(query) < 2: return []"
const LIVE_SEARCH_MIN_LENGTH = 3; // §8 step 2
const LOCAL_RESULT_LIMIT = 8; // §8 step 1: limit=8 per source
const LIVE_RESULT_LIMIT = 10; // §8 step 2: limit=10
export const DEFAULT_DEBOUNCE_MS = 600; // §8 step 2 / §6.3

function normalizeForMatch(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * "Exact or near-exact" per §8 steps 2 and 3a — the spec uses this one notion in both
 * places ("no high-confidence exact match" gates live search; "exact / near-exact
 * string match" is the top ranking tier), so it's implemented once and shared rather
 * than as two similar-but-possibly-drifting checks.
 *
 * Deliberately strict: full-string equality after trimming, case-folding, and
 * whitespace-collapsing — *not* a prefix or substring check. A looser definition (e.g.
 * "displayName starts with query") would let a short query like "da" call "Dal Makhani"
 * near-exact, which both short-circuits live search too eagerly and misranks a
 * merely-plausible prefix ahead of genuinely closer fuzzy matches elsewhere in the list.
 */
export function isExactOrNearExactMatch(displayName: string, query: string): boolean {
  return normalizeForMatch(displayName) === normalizeForMatch(query);
}

/**
 * §8 step 2's gate. Live search fires only for queries of at least 3 characters, and
 * only if nothing already found locally is an exact/near-exact match — an exact local
 * hit means the person has almost certainly already found what they wanted, so spending
 * part of OFF's 10-requests/minute budget (§6.3) on it would buy nothing.
 */
export function shouldSearchLive(
  query: string,
  local: Pick<SourceMatches, 'icmr' | 'custom' | 'offCache'>,
): boolean {
  if (query.length < LIVE_SEARCH_MIN_LENGTH) return false;
  const allLocal = [...local.icmr, ...local.custom, ...local.offCache];
  return !allLocal.some((m) => isExactOrNearExactMatch(m.item.displayName, query));
}

function resultKey(item: FoodItem): string {
  // OFF items dedupe on OFF's own stable product code, not this app's internal `id` — a
  // live hit and an already-cached copy of the *same* real product won't necessarily
  // share an `id` yet (offLiveSearch.ts mints a fresh id the moment a product is first
  // seen live, independent of whether/when it's persisted to Dexie — see that file's
  // header comment). `offId` is populated the same way regardless of whether an
  // OFFFoodItem came from the bundled seed, a sync, or a live search, so it's the key
  // that actually answers "is this the same real product" across cached vs. live.
  if (item.source === 'off') return `off:${item.offId}`;
  return `id:${item.id}`;
}

function dedupeResults(results: RankedSearchResult[]): RankedSearchResult[] {
  const seen = new Set<string>();
  const deduped: RankedSearchResult[] = [];
  for (const result of results) {
    const key = resultKey(result.item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }
  return deduped;
}

/**
 * §8 step 3's merge & rank. Pure and synchronous — call once with local-only matches
 * for the immediate render (step 1), and again with `live` populated once/if the live
 * search resolves (step 2) for the follow-up render; both calls go through the exact
 * same ranking rules, so a food never appears to "jump the queue" once live results
 * arrive except by legitimately ranking ahead per these rules. Tier order:
 *
 *     exact (any source) > icmr > custom > off_cached > off_live
 *
 * with each tier internally sorted by descending `confidence`, then the whole list
 * deduplicated (an OFF product already in `offCache` must not also appear as an
 * apparent second, separate result once `live` turns up the same product again).
 *
 * Does **not** cap the result count (§8 step 3e's "~20, show more beyond that") — a cap
 * applied here would make "show more" impossible without re-running the search, since
 * anything beyond the cap would never have existed in the returned array to begin with.
 * Capping/pagination over this full ranked list is the caller's (UI's) responsibility;
 * `DEFAULT_DISPLAY_CAP` below exists so that slicing uses the same "~20" the spec states
 * rather than every call site picking its own number.
 */
export function rankAndMerge(sources: SourceMatches, query: string): RankedSearchResult[] {
  const exact: RankedSearchResult[] = [];
  const icmrTier: RankedSearchResult[] = [];
  const customTier: RankedSearchResult[] = [];
  const offCachedTier: RankedSearchResult[] = [];
  const offLiveTier: RankedSearchResult[] = [];

  function classify<T extends FoodItem>(
    matches: FuzzyMatch<T>[],
    tier: Exclude<MatchTier, 'exact'>,
    bucket: RankedSearchResult[],
  ): void {
    for (const match of matches) {
      const exactMatch = isExactOrNearExactMatch(match.item.displayName, query);
      const result: RankedSearchResult = {
        item: match.item,
        source: match.item.source,
        tier: exactMatch ? 'exact' : tier,
        confidence: match.confidence,
      };
      (exactMatch ? exact : bucket).push(result);
    }
  }

  classify(sources.icmr, 'icmr', icmrTier);
  classify(sources.custom, 'custom', customTier);
  classify(sources.offCache, 'off_cached', offCachedTier);
  classify(sources.live ?? [], 'off_live', offLiveTier);

  const byConfidenceDesc = (a: RankedSearchResult, b: RankedSearchResult): number => b.confidence - a.confidence;
  for (const tier of [exact, icmrTier, customTier, offCachedTier, offLiveTier]) {
    tier.sort(byConfidenceDesc);
  }

  return dedupeResults([...exact, ...icmrTier, ...customTier, ...offCachedTier, ...offLiveTier]);
}

/** See `rankAndMerge`'s doc comment on why capping isn't baked into ranking itself. */
export const DEFAULT_DISPLAY_CAP = 20;

export interface UnifiedSearchIndexes {
  icmrIndex: Fuse<ICMRFoodItem>;
  offCacheIndex: Fuse<OFFFoodItem>;
  customIndex: Fuse<CustomFoodItem>;
}

/**
 * §8 step 1: local, zero-network fuzzy search across all three bundled/cached sources.
 * Enforces §8's own top-level guard (`length(query) < 2` → no results, from any source)
 * so every caller gets that behavior for free instead of needing to remember it.
 */
export function searchLocalSources(indexes: UnifiedSearchIndexes, query: string): SourceMatches {
  if (query.length < MIN_QUERY_LENGTH) {
    return { icmr: [], custom: [], offCache: [] };
  }
  return {
    icmr: fuzzySearch(indexes.icmrIndex, query, LOCAL_RESULT_LIMIT),
    custom: fuzzySearch(indexes.customIndex, query, LOCAL_RESULT_LIMIT),
    offCache: fuzzySearch(indexes.offCacheIndex, query, LOCAL_RESULT_LIMIT),
  };
}

/**
 * Live OFF results never pass through Fuse — Search-a-licious does its own relevance
 * ranking server-side (§6.3: it's Elasticsearch-backed), so there's no local fuzzy
 * score to report for them. Rather than fabricate a plausible-looking similarity value,
 * this assigns strictly decreasing numbers whose *only* job is to preserve the API's
 * own result order through `rankAndMerge`'s generic "sort each tier by confidence desc"
 * step. Read as a similarity measure (e.g. "compare this 0.999998 to an ICMR match's
 * 0.6") it would be meaningless; tiers are never compared to each other by raw
 * confidence value (tier assignment already encodes that ordering), only sorted within
 * themselves, which is the one thing this construction is actually for.
 */
function assignLiveConfidence(items: OFFFoodItem[]): FuzzyMatch<OFFFoodItem>[] {
  return items.map((item, index) => ({ item, confidence: 1 - index * 1e-6 }));
}

export interface UnifiedSearchDeps extends UnifiedSearchIndexes {
  /** The seam to the one network call in this module — production wires in
   * offLiveSearch.ts's `searchOffLive`; tests inject a mock. Same pattern as
   * src/engine/callEngine.ts's real-engine/stub-engine seam. */
  liveSearch: (query: string, limit: number) => Promise<OFFFoodItem[]>;
  /** Overridable for tests; defaults to §8 step 2's 600ms. */
  debounceMs?: number;
}

export interface UnifiedSearchCallbacks {
  /** Fired synchronously, exactly once per `search()` call — §8 step 1: "render these
   * three immediately". */
  onLocalResults: (results: RankedSearchResult[]) => void;
  /** Fired at most once per `search()` call, after the debounce delay, only if live
   * search actually ran and settled successfully — with the *combined* local+live
   * ranked list (§8 step 3 describes one global ordering across all sources, live
   * included). Not fired if `shouldSearchLive` said no, if the live call failed (logged
   * instead — see `search`'s implementation), or if a later `search()` call superseded
   * this one before the debounce elapsed. */
  onLiveResults?: (results: RankedSearchResult[]) => void;
}

export interface UnifiedSearchController {
  /**
   * Runs §8 end to end for one query. Returns a promise that resolves once this call's
   * live phase has settled (ran and succeeded, ran and failed, or was never triggered) —
   * production callers (a future search-bar hook) can ignore the return value and just
   * rely on the callbacks; tests can `await` it (with fake timers advanced) instead of
   * manually orchestrating timer/microtask flushes.
   */
  search(query: string, callbacks: UnifiedSearchCallbacks): Promise<void>;
  /** Cancels any pending debounced/in-flight live search without starting a new one —
   * e.g. on unmount, or when the search bar is cleared back to empty. */
  cancel(): void;
}

/**
 * Builds a stateful search controller bound to one set of indexes/live-search
 * implementation. The state is exactly what real debouncing needs: a pending timer
 * (cleared if a newer keystroke's `search()` call arrives first) and a monotonically
 * increasing token (so a slow, already-in-flight live fetch from a stale query can't
 * clobber a newer query's results if it resolves late).
 */
export function createUnifiedSearch(deps: UnifiedSearchDeps): UnifiedSearchController {
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  let currentToken = 0;
  // The resolver for whichever `search()` call's promise is still outstanding — i.e.
  // its debounce hasn't fired yet, or it has and the live fetch is still in flight.
  // `cancel()` must settle this immediately when superseding it: without this, a call
  // that gets superseded before its debounce fires would have its `setTimeout` cleared
  // and therefore *never* reach the `resolve()` inside it — its returned promise would
  // hang forever, which is exactly the kind of thing that quietly wedges a caller who
  // does `await controller.search(...)`. Only the fetch's *effects* (calling
  // `onLiveResults`) should be suppressed for a superseded call, per `myToken`, below —
  // the promise itself must still settle.
  let resolvePending: (() => void) | undefined;

  function cancel(): void {
    if (pendingTimer !== undefined) {
      clearTimeout(pendingTimer);
      pendingTimer = undefined;
    }
    currentToken += 1; // also invalidates any live fetch already in flight
    if (resolvePending) {
      const resolve = resolvePending;
      resolvePending = undefined;
      resolve();
    }
  }

  function search(query: string, callbacks: UnifiedSearchCallbacks): Promise<void> {
    cancel(); // only the latest call should ever fire its debounce
    const myToken = currentToken;

    const local = searchLocalSources(deps, query);
    callbacks.onLocalResults(rankAndMerge(local, query));

    if (!shouldSearchLive(query, local)) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      resolvePending = resolve;
      pendingTimer = setTimeout(() => {
        deps
          .liveSearch(query, LIVE_RESULT_LIMIT)
          .then((liveItems) => {
            if (myToken !== currentToken) return; // superseded by a newer search() call
            const live = assignLiveConfidence(liveItems);
            callbacks.onLiveResults?.(rankAndMerge({ ...local, live }, query));
          })
          .catch((err: unknown) => {
            // §13 NFR: live results are additive, never blocking — a failed live call
            // degrades silently to "local results stand" from the person's point of
            // view, logged loudly so it isn't silently invisible to whoever's debugging.
            console.error('[unifiedSearch] Live OFF search failed; local results stand.', err);
          })
          .finally(() => {
            // Only clear resolvePending if it's still *this* call's resolver — a
            // superseding cancel() may have already swapped it out for a newer one.
            if (resolvePending === resolve) resolvePending = undefined;
            resolve(); // no-op if cancel() already resolved this one early
          });
      }, deps.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    });
  }

  return { search, cancel };
}
