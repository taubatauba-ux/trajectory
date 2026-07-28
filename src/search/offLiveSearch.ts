// §6.3 Live fallback search — the client for Open Food Facts' Search-a-licious API
// (search.openfoodfacts.org), used only when local search (ICMR + cached-OFF + custom)
// doesn't already have a confident answer (gating logic lives in unifiedSearch.ts, not
// here — this file is just "given a query, ask the live API, return matches").
//
// ── What's verified vs. guessed (checked July 2026, this session — re-verify before
//    trusting this in production, see below) ──
//
// Verified via web search this session:
//  - The legacy `/cgi/search.pl` endpoint is explicitly documented as deprecated *and*
//    was independently reported returning HTTP 503 globally — confirms §6.3's own
//    instruction not to build against it.
//  - Search-a-licious is real, Elasticsearch-backed, deployed at search.openfoodfacts.org,
//    and a real example query posted by an OFF team member on their own forum was:
//    `https://search.openfoodfacts.org/search?q=brands:danone+OR+stores:casino&langs=fr:en&page_size=30&page=1`
//    — confirming the base URL, path, and that `q`/`page_size`/`page` are real params.
//  - OFF's product JSON convention for nutrients (used everywhere else in their API,
//    e.g. the bulk Parquet export this app's scripts/import_off_bulk.py reads) is
//    `energy-kcal_100g`, `proteins_100g`, `carbohydrates_100g`, `fat_100g`,
//    `fiber_100g`, `sugars_100g`, `sodium_100g`, usually nested under a `nutriments`
//    object. All of these are grams except `sodium_100g`, which is *also* grams
//    (confirmed via a real product JSON example: `"sodium_unit":"g"`) despite this
//    app's own field being `sodiumMg` (milligrams, §4.2) — see the ×1000 conversion in
//    `parseHit` below, easy to miss since nothing in the OFF key name signals it.
//  - Browsers cannot set a `User-Agent` header from `fetch()` — it's on the Fetch
//    spec's forbidden-header list and is silently ignored/overridden by the browser.
//    OFF's docs ask integrators to send a custom User-Agent; that request is aimed at
//    server-side/backend integrations (like this app's Python scripts, which *can* set
//    it) and simply can't be honored from a PWA's client-side fetch. Not attempting it
//    here rather than writing a header that would silently do nothing.
//
// NOT verified — and a concrete reason for caution, not just caution-by-default: a
// developer report from within the last two weeks of this session (per search results)
// hit HTTP 404 on the Search-a-licious search path they'd been using, i.e. this exact
// endpoint has evidence of having moved or changed recently. The interactive docs at
// https://search.openfoodfacts.org/docs would settle it, but that page disallows
// automated fetching (robots.txt) from here. **Before relying on this in production,
// hit SEARCH_A_LICIOUS_BASE_URL manually (or check the docs URL above) and update it if
// it's moved — everything below is written to fail loudly and non-fatally if it has
// (see `OffLiveSearchError` usage), not to silently return wrong data.**
//
// This matters less than it might: per §13's own non-functional requirement, live OFF
// results are additive, never blocking — local search (§8 step 1) already renders
// unconditionally, so a broken or moved live endpoint degrades the app to "local-only
// search results", not a broken search feature.
import type { Macros, OFFFoodItem } from '../types/food';

export class OffLiveSearchError extends Error {}

export const SEARCH_A_LICIOUS_BASE_URL = 'https://search.openfoodfacts.org/search';

export interface SearchOffLiveOptions {
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/** §6.3/§8 step 2's `searchAlicious(query, limit)`. Rejects with `OffLiveSearchError` on
 * any failure (non-OK response, unparsable/unexpected body) — callers (unifiedSearch.ts)
 * are expected to catch this and treat it as "no live results", per §13. Individual
 * hits that don't carry enough data to build a valid `OFFFoodItem` (missing name, or
 * missing/non-numeric core macros) are skipped rather than failing the whole call — one
 * malformed hit in a page of 10 shouldn't discard the other 9. */
export async function searchOffLive(
  query: string,
  limit: number,
  options: SearchOffLiveOptions = {},
): Promise<OFFFoodItem[]> {
  const fetchImpl = options.fetchImpl ?? fetch;

  const url = new URL(SEARCH_A_LICIOUS_BASE_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('page_size', String(limit));
  url.searchParams.set('page', '1');
  // Deliberately no `langs` param: the one confirmed real example
  // (`langs=fr:en`) doesn't disambiguate its own syntax (interface-language-with-
  // fallback? a set of languages to search across?) well enough to guess at safely — an
  // omitted optional filter is far less risky than a malformed one silently narrowing
  // every query to zero results. Worth revisiting once the current docs are reachable.

  let response: Response;
  try {
    response = await fetchImpl(url.toString());
  } catch (err) {
    throw new OffLiveSearchError(
      `Network error calling Search-a-licious: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new OffLiveSearchError(
      `Search-a-licious responded ${response.status} ${response.statusText}. If this ` +
        `persists, the endpoint may have moved — see this file's header comment.`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new OffLiveSearchError('Search-a-licious response was not valid JSON.');
  }

  const hits = extractHits(body);
  const items: OFFFoodItem[] = [];
  for (const hit of hits) {
    const item = parseHit(hit);
    if (item) items.push(item);
  }
  return items;
}

/**
 * Elasticsearch-backed APIs commonly return results either as a flat top-level `hits`
 * array (a wrapper API's simplified shape) or the raw ES convention nested at
 * `hits.hits`. Some alternative field names (`products`, `results`) are checked too,
 * since the exact wrapper shape isn't independently confirmed (see file header) — this
 * is deliberately generous about *where* the array is, while `parseHit` below stays
 * strict about what's *inside* each element.
 */
function extractHits(body: unknown): unknown[] {
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.hits)) return obj.hits;
    if (obj.hits && typeof obj.hits === 'object') {
      const nested = (obj.hits as Record<string, unknown>).hits;
      if (Array.isArray(nested)) return nested;
    }
    if (Array.isArray(obj.products)) return obj.products;
    if (Array.isArray(obj.results)) return obj.results;
  }
  throw new OffLiveSearchError(
    'Unexpected response shape from Search-a-licious (no hits/products/results array ' +
      'found). The API may have changed — check https://search.openfoodfacts.org/docs.',
  );
}

/** Reads a nutrient value trying both the standard nested `nutriments.<key>` location
 * and a flat `<key>` directly on the hit — the exact projection a search *result* (as
 * opposed to a full product document) returns isn't independently confirmed, so both
 * shapes are tried rather than assuming one. */
function readNutrient(hit: Record<string, unknown>, key: string): number | undefined {
  const nutriments = hit.nutriments;
  if (nutriments && typeof nutriments === 'object') {
    const nested = (nutriments as Record<string, unknown>)[key];
    if (typeof nested === 'number' && Number.isFinite(nested)) return nested;
  }
  const flat = hit[key];
  if (typeof flat === 'number' && Number.isFinite(flat)) return flat;
  return undefined;
}

function parseHit(rawHit: unknown): OFFFoodItem | null {
  if (!rawHit || typeof rawHit !== 'object') return null;
  const hit = rawHit as Record<string, unknown>;

  const displayName = hit.product_name;
  const code = hit.code;
  if (typeof displayName !== 'string' || displayName.trim() === '') return null;
  if (typeof code !== 'string' || code.trim() === '') return null;

  const kcal = readNutrient(hit, 'energy-kcal_100g');
  const proteinG = readNutrient(hit, 'proteins_100g');
  const fatG = readNutrient(hit, 'fat_100g');
  const carbG = readNutrient(hit, 'carbohydrates_100g');
  // The four headline macros are load-bearing for the whole app (targets, logging,
  // recipes all key off them) — a hit missing any of them can't be shown as a
  // trustworthy result, so it's skipped rather than half-filled with fabricated zeros
  // (same reasoning as macros.ts's null-vs-0 handling, just applied at the parse
  // boundary instead of in arithmetic).
  if (kcal === undefined || proteinG === undefined || fatG === undefined || carbG === undefined) {
    console.warn(
      `[offLiveSearch] Skipping live result "${displayName}" (code ${code}) — missing ` +
        'one or more core macros in the response.',
    );
    return null;
  }

  const per100g: Macros = { kcal, proteinG, fatG, carbG };
  const fiberG = readNutrient(hit, 'fiber_100g');
  const sugarG = readNutrient(hit, 'sugars_100g');
  // OFF reports sodium in GRAMS per 100g under this key (confirmed via a real example
  // product JSON this session: `"sodium_unit":"g", "sodium_100g":0.44` — every other
  // OFF `_100g` nutrient field used here is already grams matching this app's *G
  // suffix fields, but the app's own field is named `sodiumMg` — milligrams — so this
  // is the one field here that needs an actual unit conversion, not a direct
  // passthrough. Easy to miss since nothing about the key name ("sodium_100g") signals
  // it, which is exactly why it's called out explicitly here rather than left implicit.
  const sodiumG = readNutrient(hit, 'sodium_100g');
  if (fiberG !== undefined) per100g.fiberG = fiberG;
  if (sugarG !== undefined) per100g.sugarG = sugarG;
  if (sodiumG !== undefined) per100g.sodiumMg = sodiumG * 1000;

  const brand = typeof hit.brands === 'string' && hit.brands.trim() !== '' ? hit.brands : undefined;

  return {
    // A fresh id is minted here, at first sight of the product, rather than only if/when
    // the user taps it — see this file's header comment and unifiedSearch.ts's dedup
    // logic for why "created" (now) and "persisted to Dexie" (only on tap, §6.3) are
    // different moments, and why that's fine: nothing observes this id as
    // Dexie-durable until §9.3's UI actually writes it there.
    id: crypto.randomUUID(),
    displayName,
    source: 'off',
    per100g,
    // OFF's `code` *is* the barcode — there's no separate product-id distinct from it
    // in OFF's own data model (confirmed via their standard product API shape, used
    // consistently across v2/v3 and the bulk export this app's other scripts read).
    offId: code,
    barcode: code,
    brand,
    lastSyncedAt: new Date().toISOString(),
  };
}
