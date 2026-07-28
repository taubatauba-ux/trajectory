// §4.2 Food Items — discriminated union on `source`. Source of truth:
// trajectory-app-technical-specification.md §4.2.

export interface Macros {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  fiberG?: number;
  sugarG?: number;
  sodiumMg?: number;
  ironMg?: number;
  calciumMg?: number;
  // Extensible — Phase 2 ICMR enrichment (§5.2) adds more optional fields here, never
  // removes any. If you add a field, it MUST be optional, for exactly this reason.
}

export interface FoodItemBase {
  /** Internal UUID, stable forever once created. */
  id: string;
  displayName: string;
  source: 'icmr' | 'off' | 'custom';
  per100g: Macros;
  servingSuggestion?: { label: string; grams: number };
}

export interface ICMRFoodItem extends FoodItemBase {
  source: 'icmr';
  /** e.g. "A007" — see §5.5 for code scheme. */
  ifctCode: string;
  /** One of the 19 groups, §5.2. */
  foodGroup: string;
}

export interface OFFFoodItem extends FoodItemBase {
  source: 'off';
  barcode?: string;
  brand?: string;
  /** OFF's own product code. */
  offId: string;
  lastSyncedAt: string;
}

export interface RecipeIngredient {
  /** References any FoodItem, any source. */
  foodItemId: string;
  grams: number;
}

export interface CustomFoodItem extends FoodItemBase {
  source: 'custom';
  createdAt: string;
  isRecipe: boolean;
  /** Present only if isRecipe. */
  ingredients?: RecipeIngredient[];
  /** Total cooked weight of the whole batch — see §7. Present only if isRecipe. */
  totalYieldG?: number;
}

export type FoodItem = ICMRFoodItem | OFFFoodItem | CustomFoodItem;

// --- Narrowing helpers -------------------------------------------------------------
// Small, boring type guards used throughout search/logging/UI code instead of
// re-deriving `item.source === 'x'` checks everywhere.

export function isICMRFoodItem(item: FoodItem): item is ICMRFoodItem {
  return item.source === 'icmr';
}

export function isOFFFoodItem(item: FoodItem): item is OFFFoodItem {
  return item.source === 'off';
}

export function isCustomFoodItem(item: FoodItem): item is CustomFoodItem {
  return item.source === 'custom';
}

export function isRecipe(item: FoodItem): item is CustomFoodItem & { isRecipe: true } {
  return isCustomFoodItem(item) && item.isRecipe === true;
}
