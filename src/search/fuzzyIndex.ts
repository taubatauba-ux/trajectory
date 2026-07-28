// §8 Unified Search & Ranking Algorithm — Step 1's `fuzzySearch(index, query, limit)`.
// Thin, deliberately dumb wrapper around Fuse.js (chosen in §2's tech stack): building
// an index and running a bounded fuzzy search against it, nothing else. Ranking across
// sources (§8 step 3) is unifiedSearch.ts's job, not this file's — keeping "how do we
// fuzzy-match within one list" separate from "how do we merge several ranked lists"
// means each half can be tested (and reasoned about) on its own.
import Fuse, { type FuseOptionKey, type IFuseOptions } from 'fuse.js';
import type { ICMRFoodItem, OFFFoodItem, CustomFoodItem } from '../types/food';

/**
 * A single fuzzy match, source-agnostic.
 *
 * `confidence`: 1 = perfect/exact text match, 0 = the weakest match Fuse still returned
 * within its threshold. This is **`1 - Fuse's own score`** — Fuse's own convention is
 * the opposite (0 = perfect, 1 = worst), which reads backwards to anyone not holding
 * that convention in their head while skimming ranking code. Inverting once, here, at
 * the one place Fuse's raw score is touched, means every consumer downstream (ranking,
 * eventually UI) can treat "higher `confidence` = better match" uniformly with no risk
 * of the sign getting flipped by accident three files away.
 */
export interface FuzzyMatch<T> {
  item: T;
  confidence: number;
}

// Fuse option choices, applied to every index built here:
//  - ignoreLocation: food names are matched wherever the query appears in the string,
//    not just as a prefix — "noodles maggi" and "maggi noodles" should both surface the
//    same product.
//  - threshold 0.35: Fuse's scale runs 0 (exact match only) to 1 (matches almost
//    anything). 0.35 is deliberately on the permissive side of Fuse's own suggested
//    range, so a plausible typo ("chiken" → "chicken") still surfaces the food, without
//    being so loose unrelated foods start showing up — 528 ICMR entries and a
//    curated/India-filtered OFF slice (§6.1) are both small enough that a slightly wide
//    net costs little precision, and search results are always tagged by source (§9.3)
//    so a rare weak match is easy for the person to visually discount.
// Neither of these is stated explicitly in trajectory-app-technical-specification.md
// (§8 says "fuzzySearch", not which Fuse options that implies) — this is an
// implementation decision, flagged the same way db.ts's index choices are.
const BASE_FUSE_OPTIONS: IFuseOptions<unknown> = {
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.35,
};

function createIndex<T>(items: readonly T[], keys: FuseOptionKey<T>[]): Fuse<T> {
  return new Fuse(items as T[], { ...BASE_FUSE_OPTIONS, keys });
}

/** ICMR items are matched on name alone — there's no brand/alias field to weight in
 * (§4.2's ICMRFoodItem has no field like that), and `foodGroup` is a category, not
 * something a person searching by food name would type. */
export function buildICMRIndex(items: readonly ICMRFoodItem[]): Fuse<ICMRFoodItem> {
  return createIndex(items, ['displayName']);
}

/** OFF items also index `brand` (at lower weight than `displayName`): OFF's
 * `product_name` (→ `displayName`, per §6.1's column mapping) is crowdsourced and
 * inconsistently includes the brand — "2-Minute Noodles Masala" vs. "Maggi 2-Minute
 * Noodles Masala" both occur in practice for what a shopper calls "Maggi noodles" either
 * way. Weighting `brand` in lets a brand-only query still surface the product without
 * letting brand matches drown out closer name matches (0.7/0.3 split, not 0.5/0.5). */
export function buildOFFIndex(items: readonly OFFFoodItem[]): Fuse<OFFFoodItem> {
  return createIndex(items, [
    { name: 'displayName', weight: 0.7 },
    { name: 'brand', weight: 0.3 },
  ]);
}

/** Custom foods/recipes are matched on name alone — a user's own dish only has the name
 * they gave it (§4.2's CustomFoodItem has no separate brand-like field). */
export function buildCustomIndex(items: readonly CustomFoodItem[]): Fuse<CustomFoodItem> {
  return createIndex(items, ['displayName']);
}

/** §8 step 1's `fuzzySearch(index, query, limit=8)`. */
export function fuzzySearch<T>(index: Fuse<T>, query: string, limit: number): FuzzyMatch<T>[] {
  return index.search(query, { limit }).map((result) => ({
    item: result.item,
    confidence: 1 - (result.score ?? 1),
  }));
}
