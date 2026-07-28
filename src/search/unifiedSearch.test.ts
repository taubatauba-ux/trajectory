import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isExactOrNearExactMatch,
  shouldSearchLive,
  rankAndMerge,
  searchLocalSources,
  createUnifiedSearch,
  DEFAULT_DEBOUNCE_MS,
  type SourceMatches,
  type RankedSearchResult,
} from './unifiedSearch';
import { buildICMRIndex, buildOFFIndex, buildCustomIndex, type FuzzyMatch } from './fuzzyIndex';
import type { ICMRFoodItem, OFFFoodItem, CustomFoodItem } from '../types/food';

// ---- Fixtures --------------------------------------------------------------------

const RICE: ICMRFoodItem = {
  id: 'icmr-1',
  displayName: 'Rice, raw, milled',
  source: 'icmr',
  ifctCode: 'A001',
  foodGroup: 'Cereals & millets',
  per100g: { kcal: 345, proteinG: 6.8, fatG: 0.5, carbG: 78.2 },
};
const WHEAT: ICMRFoodItem = {
  id: 'icmr-2',
  displayName: 'Wheat flour, whole',
  source: 'icmr',
  ifctCode: 'A010',
  foodGroup: 'Cereals & millets',
  per100g: { kcal: 341, proteinG: 12.1, fatG: 1.7, carbG: 69.4 },
};

const MAGGI: OFFFoodItem = {
  id: 'off-1',
  displayName: 'Maggi 2-Minute Noodles Masala',
  source: 'off',
  offId: '8901058851226',
  brand: 'Maggi',
  lastSyncedAt: '2026-06-01T00:00:00.000Z',
  per100g: { kcal: 402, proteinG: 8.7, fatG: 16.9, carbG: 56.7 },
};
const MARIE_GOLD: OFFFoodItem = {
  id: 'off-2',
  displayName: 'Marie Gold Biscuits',
  source: 'off',
  offId: '8901063010017',
  brand: 'Britannia',
  lastSyncedAt: '2026-06-01T00:00:00.000Z',
  per100g: { kcal: 450, proteinG: 7, fatG: 14, carbG: 74 },
};

const DAL_TADKA: CustomFoodItem = {
  id: 'custom-1',
  displayName: 'My Dal Tadka',
  source: 'custom',
  createdAt: '2026-06-01T00:00:00.000Z',
  isRecipe: true,
  per100g: { kcal: 120, proteinG: 7, fatG: 3, carbG: 16 },
};

function match<T extends { displayName: string }>(item: T, confidence = 1): FuzzyMatch<T> {
  return { item, confidence };
}

// ---- isExactOrNearExactMatch -------------------------------------------------------

describe('isExactOrNearExactMatch', () => {
  it('matches identical strings', () => {
    expect(isExactOrNearExactMatch('Maggi Noodles', 'Maggi Noodles')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isExactOrNearExactMatch('Maggi Noodles', 'maggi noodles')).toBe(true);
  });

  it('ignores leading/trailing whitespace and collapses internal whitespace', () => {
    expect(isExactOrNearExactMatch('Maggi   Noodles', '  maggi noodles  ')).toBe(true);
  });

  it('does NOT match a mere prefix', () => {
    expect(isExactOrNearExactMatch('Maggi 2-Minute Noodles Masala', 'Maggi')).toBe(false);
  });

  it('does not match unrelated strings', () => {
    expect(isExactOrNearExactMatch('Rice, raw, milled', 'wheat')).toBe(false);
  });
});

// ---- shouldSearchLive ---------------------------------------------------------------

describe('shouldSearchLive', () => {
  const emptyLocal: Pick<SourceMatches, 'icmr' | 'custom' | 'offCache'> = {
    icmr: [],
    custom: [],
    offCache: [],
  };

  it('is false under the 3-character minimum, regardless of local results', () => {
    expect(shouldSearchLive('ma', emptyLocal)).toBe(false);
  });

  it('is true at 3+ characters with no local matches at all', () => {
    expect(shouldSearchLive('mag', emptyLocal)).toBe(true);
  });

  it('is false when a local match is exact', () => {
    const local = { ...emptyLocal, offCache: [match(MAGGI)] };
    expect(shouldSearchLive('Maggi 2-Minute Noodles Masala', local)).toBe(false);
  });

  it('is true when local matches exist but none are exact', () => {
    const local = { ...emptyLocal, offCache: [match(MAGGI, 0.6)] };
    expect(shouldSearchLive('magi noodle', local)).toBe(true);
  });

  it('checks all three local sources for an exact match, not just one', () => {
    const localIcmr = { ...emptyLocal, icmr: [match(RICE)] };
    expect(shouldSearchLive('Rice, raw, milled', localIcmr)).toBe(false);
    const localCustom = { ...emptyLocal, custom: [match(DAL_TADKA)] };
    expect(shouldSearchLive('My Dal Tadka', localCustom)).toBe(false);
  });
});

// ---- rankAndMerge ---------------------------------------------------------------------

describe('rankAndMerge', () => {
  it('orders tiers as exact > icmr > custom > off_cached > off_live', () => {
    const sources: SourceMatches = {
      icmr: [match(RICE, 0.5)],
      custom: [match(DAL_TADKA, 0.9)], // higher confidence than icmr, should still rank after it
      offCache: [match(MARIE_GOLD, 0.99)], // even higher, should still rank after custom
      live: [match(MAGGI, 0.999999)], // highest of all, should still rank last (non-exact)
    };
    const results = rankAndMerge(sources, 'zzz-no-exact-match-zzz');
    expect(results.map((r) => r.tier)).toEqual(['icmr', 'custom', 'off_cached', 'off_live']);
  });

  it('places an exact match first regardless of which source it came from', () => {
    const sources: SourceMatches = {
      icmr: [match(RICE, 0.3)],
      custom: [],
      offCache: [match(MAGGI, 0.3)], // low fuzzy confidence, but this IS the exact query
      live: [],
    };
    const results = rankAndMerge(sources, 'Maggi 2-Minute Noodles Masala');
    expect(results[0]?.tier).toBe('exact');
    expect(results[0]?.item.id).toBe('off-1');
  });

  it('sorts within a tier by descending confidence', () => {
    const sources: SourceMatches = {
      icmr: [match(WHEAT, 0.4), match(RICE, 0.9)],
      custom: [],
      offCache: [],
    };
    const results = rankAndMerge(sources, 'zzz');
    expect(results.map((r) => r.item.id)).toEqual(['icmr-1', 'icmr-2']); // RICE (0.9) before WHEAT (0.4)
  });

  it('carries `source` at the top level matching item.source', () => {
    const results = rankAndMerge({ icmr: [match(RICE)], custom: [], offCache: [] }, 'zzz');
    expect(results[0]?.source).toBe('icmr');
  });

  it('dedupes a live OFF result that is already present in the cached OFF tier, keeping the cached one', () => {
    const cachedCopy = match(MAGGI, 0.5);
    const liveCopy: FuzzyMatch<OFFFoodItem> = {
      item: { ...MAGGI, id: 'off-1-live-instance' }, // different internal id, same offId
      confidence: 0.999,
    };
    const sources: SourceMatches = { icmr: [], custom: [], offCache: [cachedCopy], live: [liveCopy] };
    const results = rankAndMerge(sources, 'zzz-no-exact-zzz');
    const maggiResults = results.filter(
      (r) => r.item.source === 'off' && (r.item as OFFFoodItem).offId === MAGGI.offId,
    );
    expect(maggiResults).toHaveLength(1);
    expect(maggiResults[0]?.item.id).toBe('off-1'); // the cached copy's id, not the live one's
    expect(maggiResults[0]?.tier).toBe('off_cached');
  });

  it('does not dedupe two genuinely different foods', () => {
    const results = rankAndMerge(
      { icmr: [match(RICE)], custom: [], offCache: [match(MAGGI)] },
      'zzz-no-exact-zzz',
    );
    expect(results).toHaveLength(2);
  });

  it('handles an entirely empty input', () => {
    expect(rankAndMerge({ icmr: [], custom: [], offCache: [] }, 'anything')).toEqual([]);
  });

  it('treats a missing `live` the same as an empty one', () => {
    const withoutLive = rankAndMerge({ icmr: [match(RICE)], custom: [], offCache: [] }, 'zzz');
    const withEmptyLive = rankAndMerge({ icmr: [match(RICE)], custom: [], offCache: [], live: [] }, 'zzz');
    expect(withoutLive).toEqual(withEmptyLive);
  });
});

// ---- searchLocalSources (integration with real Fuse indexes) ------------------------

describe('searchLocalSources', () => {
  const indexes = {
    icmrIndex: buildICMRIndex([RICE, WHEAT]),
    offCacheIndex: buildOFFIndex([MAGGI, MARIE_GOLD]),
    customIndex: buildCustomIndex([DAL_TADKA]),
  };

  it('returns empty results for a 0- or 1-character query without touching Fuse', () => {
    expect(searchLocalSources(indexes, '')).toEqual({ icmr: [], custom: [], offCache: [] });
    expect(searchLocalSources(indexes, 'r')).toEqual({ icmr: [], custom: [], offCache: [] });
  });

  it('finds an ICMR item by fuzzy name match', () => {
    const result = searchLocalSources(indexes, 'rice');
    expect(result.icmr.some((m) => m.item.id === 'icmr-1')).toBe(true);
  });

  it('finds an OFF item by brand as well as by name', () => {
    const byBrand = searchLocalSources(indexes, 'britannia');
    expect(byBrand.offCache.some((m) => m.item.id === 'off-2')).toBe(true);
  });

  it('finds a custom recipe by name', () => {
    const result = searchLocalSources(indexes, 'tadka');
    expect(result.custom.some((m) => m.item.id === 'custom-1')).toBe(true);
  });

  it('never returns a `live` key from local-only search', () => {
    const result = searchLocalSources(indexes, 'rice');
    expect(result.live).toBeUndefined();
  });
});

// ---- createUnifiedSearch (debounced orchestration) -----------------------------------

describe('createUnifiedSearch', () => {
  const indexes = {
    icmrIndex: buildICMRIndex([RICE, WHEAT]),
    offCacheIndex: buildOFFIndex([MAGGI, MARIE_GOLD]),
    customIndex: buildCustomIndex([DAL_TADKA]),
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onLocalResults synchronously, before the debounce elapses', async () => {
    const liveSearch = vi.fn().mockResolvedValue([]);
    const controller = createUnifiedSearch({ ...indexes, liveSearch });
    const onLocalResults = vi.fn();

    void controller.search('rice', { onLocalResults });

    expect(onLocalResults).toHaveBeenCalledTimes(1);
    expect(liveSearch).not.toHaveBeenCalled(); // debounce hasn't elapsed yet
  });

  it('does not call liveSearch for a query under 3 characters', async () => {
    const liveSearch = vi.fn().mockResolvedValue([]);
    const controller = createUnifiedSearch({ ...indexes, liveSearch });
    const promise = controller.search('ri', { onLocalResults: vi.fn() });
    await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS + 100);
    await promise;
    expect(liveSearch).not.toHaveBeenCalled();
  });

  it('does not call liveSearch when a local match is already exact', async () => {
    const liveSearch = vi.fn().mockResolvedValue([]);
    const controller = createUnifiedSearch({ ...indexes, liveSearch });
    const promise = controller.search('Rice, raw, milled', { onLocalResults: vi.fn() });
    await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS + 100);
    await promise;
    expect(liveSearch).not.toHaveBeenCalled();
  });

  it('calls liveSearch after the debounce for a qualifying query, and reports merged results', async () => {
    const liveItem: OFFFoodItem = {
      id: 'off-live-1',
      displayName: 'Sunfeast Marie Light',
      source: 'off',
      offId: '8901491101013',
      brand: 'Sunfeast',
      lastSyncedAt: '2026-07-01T00:00:00.000Z',
      per100g: { kcal: 440, proteinG: 7.5, fatG: 12, carbG: 76 },
    };
    const liveSearch = vi.fn().mockResolvedValue([liveItem]);
    const controller = createUnifiedSearch({ ...indexes, liveSearch });
    const onLocalResults = vi.fn();
    const onLiveResults = vi.fn();

    const promise = controller.search('marie', { onLocalResults, onLiveResults });
    expect(liveSearch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS + 100);
    await promise;

    expect(liveSearch).toHaveBeenCalledWith('marie', 10);
    expect(onLiveResults).toHaveBeenCalledTimes(1);
    const liveResults = onLiveResults.mock.calls[0]?.[0] as RankedSearchResult[];
    // Should include both the pre-existing cached match (Marie Gold) and the new live one.
    expect(liveResults.some((r) => r.item.id === 'off-2')).toBe(true);
    expect(liveResults.some((r) => r.item.id === 'off-live-1')).toBe(true);
    // Cached ranks before live.
    const cachedIdx = liveResults.findIndex((r) => r.item.id === 'off-2');
    const liveIdx = liveResults.findIndex((r) => r.item.id === 'off-live-1');
    expect(cachedIdx).toBeLessThan(liveIdx);
  });

  it('cancels a pending debounce when a new search() call supersedes it (only the latest fires)', async () => {
    const liveSearch = vi.fn().mockResolvedValue([]);
    const controller = createUnifiedSearch({ ...indexes, liveSearch });

    const first = controller.search('mar', { onLocalResults: vi.fn() });
    await vi.advanceTimersByTimeAsync(300); // less than the 600ms debounce
    const second = controller.search('mari', { onLocalResults: vi.fn() });
    await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS + 100);
    await Promise.all([first, second]);

    expect(liveSearch).toHaveBeenCalledTimes(1);
    expect(liveSearch).toHaveBeenCalledWith('mari', 10);
  });

  it('discards a stale in-flight live result if superseded before it resolves', async () => {
    let resolveFirst: (items: OFFFoodItem[]) => void = () => {};
    const firstCallPromise = new Promise<OFFFoodItem[]>((resolve) => {
      resolveFirst = resolve;
    });
    const liveSearch = vi
      .fn()
      .mockImplementationOnce(() => firstCallPromise)
      .mockImplementationOnce(() => Promise.resolve([]));

    const controller = createUnifiedSearch({ ...indexes, liveSearch });
    const onLiveResultsFirst = vi.fn();
    const onLiveResultsSecond = vi.fn();

    const first = controller.search('mar', { onLocalResults: vi.fn(), onLiveResults: onLiveResultsFirst });
    await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS + 10); // first debounce fires, liveSearch #1 now in flight

    const second = controller.search('marx', { onLocalResults: vi.fn(), onLiveResults: onLiveResultsSecond });
    await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS + 10); // second debounce fires and resolves (empty)
    await second;

    // Now let the first (stale) call's live search finally resolve.
    resolveFirst([]);
    await first;

    expect(onLiveResultsFirst).not.toHaveBeenCalled(); // superseded — must not fire at all
  });

  it('does not throw and still resolves the promise when liveSearch rejects', async () => {
    const liveSearch = vi.fn().mockRejectedValue(new Error('network down'));
    const controller = createUnifiedSearch({ ...indexes, liveSearch });
    const onLiveResults = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const promise = controller.search('marie', { onLocalResults: vi.fn(), onLiveResults });
    await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS + 100);
    await expect(promise).resolves.toBeUndefined();

    expect(onLiveResults).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('cancel() prevents a pending live search from ever firing', async () => {
    const liveSearch = vi.fn().mockResolvedValue([]);
    const controller = createUnifiedSearch({ ...indexes, liveSearch });
    void controller.search('marie', { onLocalResults: vi.fn() });
    controller.cancel();
    await vi.advanceTimersByTimeAsync(DEFAULT_DEBOUNCE_MS + 100);
    expect(liveSearch).not.toHaveBeenCalled();
  });
});
