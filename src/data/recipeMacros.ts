// §7 Custom Foods & Recipes — the per-serving macro formula. Source of truth:
// trajectory-app-technical-specification.md §7.
//
// NOTE for whoever merges parallel work: PROGRESS_REPORT.md scopes "the custom
// food/recipe macro calculator (§7)" to Part 2. Part 4 (this file) needed it to drive the
// Recipe Builder screen's live preview, and the formula below is fully specified by
// §7 with no room for ambiguity — a correct Part 2 implementation should be
// arithmetically identical to this one. If Part 2 also produced one, treat the two as
// interchangeable: keep either, delete the other, no logic to reconcile.
import type { Macros } from '../types/food';
import { scaleMacros, sumMacros } from './macrosMath';

export interface RecipeIngredientInput {
  /** The ingredient FoodItem's own per-100g macros — the caller resolves foodItemId to
   * this via db.foodItems before calling in. */
  per100g: Macros;
  /** Raw (uncooked, as-added) grams of this ingredient. */
  grams: number;
}

/**
 * rawTotal[macro] = Σ (ingredient.per100g[macro] × ingredient.grams / 100)  for every ingredient
 *
 * Required fields (kcal/proteinG/fatG/carbG) always sum since every ingredient's Macros
 * guarantees them. Optional fields sum across only the ingredients that report them —
 * best-effort, not "assume zero for untracked ingredients then present as complete" (see
 * macrosMath.ts's sumMacros, which this delegates to, for the full reasoning).
 */
export function computeRawTotal(ingredients: RecipeIngredientInput[]): Macros {
  return sumMacros(ingredients.map(({ per100g, grams }) => scaleMacros(per100g, grams / 100)));
}

/**
 * perServing[macro] = rawTotal[macro] × (servingGrams / totalYieldG)
 *
 * `servingGrams` is generic on purpose: pass 100 to get the canonical `per100g` a
 * CustomFoodItem stores (§4.2's FoodItemBase requires per100g on every FoodItem, recipes
 * included — there's no separate "perServing" field in the data model), or pass a
 * `servingSuggestion.grams` value to preview what that serving looks like while building.
 *
 * totalYieldG <= 0 is a not-yet-entered field mid-build, not a real recipe state — callers
 * (Recipe Builder) should guard the UI on this rather than have it throw, but this throws
 * rather than silently dividing by zero so a bug elsewhere surfaces loudly instead of
 * producing Infinity/NaN macros.
 */
export function computeMacrosForServing(
  rawTotal: Macros,
  totalYieldG: number,
  servingGrams: number,
): Macros {
  if (!(totalYieldG > 0)) {
    throw new Error('computeMacrosForServing requires a positive totalYieldG');
  }
  return scaleMacros(rawTotal, servingGrams / totalYieldG);
}

/** Convenience: ingredients + yield straight to the canonical per-100g a FoodItem stores. */
export function computeRecipePer100g(ingredients: RecipeIngredientInput[], totalYieldG: number): Macros {
  return computeMacrosForServing(computeRawTotal(ingredients), totalYieldG, 100);
}
