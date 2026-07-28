import { describe, it, expect, vi } from 'vitest';
import { searchOffLive, OffLiveSearchError, SEARCH_A_LICIOUS_BASE_URL } from './offLiveSearch';

function jsonResponse(body: unknown, init?: { status?: number; statusText?: string }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    statusText: init?.statusText ?? 'OK',
    headers: { 'content-type': 'application/json' },
  });
}

const WELL_FORMED_HIT = {
  code: '8901058851226',
  product_name: 'Maggi 2-Minute Noodles Masala',
  brands: 'Maggi,Nestlé',
  nutriments: {
    'energy-kcal_100g': 402,
    proteins_100g: 8.7,
    fat_100g: 16.9,
    carbohydrates_100g: 56.7,
    fiber_100g: 3.2,
    sodium_100g: 1.42, // grams, per OFF's convention — expect ×1000 = 1420mg
  },
};

describe('searchOffLive — request construction', () => {
  it('builds the URL with q, page_size, and page params', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ hits: [] }));
    await searchOffLive('maggi', 10, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstCallArgs = fetchImpl.mock.calls[0];
    if (!firstCallArgs) throw new Error('fetchImpl was not called');
    const calledUrl = new URL(firstCallArgs[0] as string);
    expect(calledUrl.origin + calledUrl.pathname).toBe(SEARCH_A_LICIOUS_BASE_URL);
    expect(calledUrl.searchParams.get('q')).toBe('maggi');
    expect(calledUrl.searchParams.get('page_size')).toBe('10');
    expect(calledUrl.searchParams.get('page')).toBe('1');
  });
});

describe('searchOffLive — response parsing', () => {
  it('parses a flat `hits` array into OFFFoodItems', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ hits: [WELL_FORMED_HIT] }));
    const results = await searchOffLive('maggi', 10, { fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(results).toHaveLength(1);
    const item = results[0]!;
    expect(item.source).toBe('off');
    expect(item.displayName).toBe('Maggi 2-Minute Noodles Masala');
    expect(item.offId).toBe('8901058851226');
    expect(item.barcode).toBe('8901058851226');
    expect(item.brand).toBe('Maggi,Nestlé');
    expect(item.per100g.kcal).toBe(402);
    expect(item.per100g.proteinG).toBe(8.7);
    expect(item.per100g.fatG).toBe(16.9);
    expect(item.per100g.carbG).toBe(56.7);
    expect(item.per100g.fiberG).toBe(3.2);
    expect(item.per100g.sugarG).toBeUndefined();
    expect(item.id).toBeTruthy();
    expect(item.lastSyncedAt).toBeTruthy();
  });

  it("converts sodium from OFF grams to the app's milligrams (regression: was a straight passthrough)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ hits: [WELL_FORMED_HIT] }));
    const results = await searchOffLive('maggi', 10, { fetchImpl: fetchImpl as unknown as typeof fetch });
    // WELL_FORMED_HIT has sodium_100g: 1.42 (grams) -> sodiumMg should be 1420, not 1.42.
    expect(results[0]!.per100g.sodiumMg).toBeCloseTo(1420, 10);
  });

  it('parses the nested raw-Elasticsearch `hits.hits` shape', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ hits: { total: 1, hits: [WELL_FORMED_HIT] } }));
    const results = await searchOffLive('maggi', 10, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(results).toHaveLength(1);
    expect(results[0]!.displayName).toBe('Maggi 2-Minute Noodles Masala');
  });

  it('falls back to a `products` array if present instead of `hits`', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ products: [WELL_FORMED_HIT] }));
    const results = await searchOffLive('maggi', 10, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(results).toHaveLength(1);
  });

  it('reads nutrients from a flat shape too (not just nested under `nutriments`)', async () => {
    const flatHit = {
      code: '123',
      product_name: 'Test Product',
      'energy-kcal_100g': 100,
      proteins_100g: 5,
      fat_100g: 2,
      carbohydrates_100g: 10,
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ hits: [flatHit] }));
    const results = await searchOffLive('test', 10, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(results).toHaveLength(1);
    expect(results[0]!.per100g.kcal).toBe(100);
  });

  it('skips a hit missing a core macro, but keeps well-formed hits in the same page', async () => {
    const incompleteHit = {
      code: '999',
      product_name: 'Incomplete Product',
      nutriments: { 'energy-kcal_100g': 100, proteins_100g: 5, fat_100g: 2 }, // no carbs
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ hits: [incompleteHit, WELL_FORMED_HIT] }));
    const results = await searchOffLive('x', 10, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(results).toHaveLength(1);
    expect(results[0]!.offId).toBe('8901058851226');
  });

  it('skips a hit with no product_name', async () => {
    const noName = { code: '111', nutriments: WELL_FORMED_HIT.nutriments };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ hits: [noName] }));
    const results = await searchOffLive('x', 10, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(results).toHaveLength(0);
  });

  it('omits brand when the hit has none', async () => {
    const noBrand = { ...WELL_FORMED_HIT, brands: undefined };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ hits: [noBrand] }));
    const results = await searchOffLive('x', 10, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(results[0]!.brand).toBeUndefined();
  });
});

describe('searchOffLive — failure handling', () => {
  it('throws OffLiveSearchError on a non-OK HTTP status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { status: 404, statusText: 'Not Found' }));
    await expect(
      searchOffLive('x', 10, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(OffLiveSearchError);
  });

  it('throws OffLiveSearchError when the body is not valid JSON', async () => {
    const badResponse = new Response('not json{{{', { status: 200 });
    const fetchImpl = vi.fn().mockResolvedValue(badResponse);
    await expect(
      searchOffLive('x', 10, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(OffLiveSearchError);
  });

  it('throws OffLiveSearchError when the response has no recognizable hits array', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ totally: 'unexpected' }));
    await expect(
      searchOffLive('x', 10, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(OffLiveSearchError);
  });

  it('throws OffLiveSearchError when fetch itself rejects (network failure)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('network down'));
    await expect(
      searchOffLive('x', 10, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(OffLiveSearchError);
  });
});
