import { useState } from 'react';
import { db } from '../../data/db';
import { newId } from '../../data/id';
import { computeMacrosForServing, computeRawTotal } from '../../data/recipeMacros';
import { formatMacroValue, populatedMacroFields } from '../../data/macroFields';
import { TagChip } from '../../components/TagChip';
import { DetailRow } from '../../components/DetailRow';
import type { CustomFoodItem, FoodItem } from '../../types/food';
import { useUnifiedSearch } from '../../search/useUnifiedSearch';

export interface RecipeBuilderProps {
  onSaved?: (item: CustomFoodItem) => void;
  onCancel?: () => void;
}

interface IngredientRow {
  rowId: string;
  foodItem: FoodItem;
  grams: string;
}

export function RecipeBuilder({ onSaved, onCancel }: RecipeBuilderProps) {
  const [displayName, setDisplayName] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [totalYieldG, setTotalYieldG] = useState('');
  const [servingLabel, setServingLabel] = useState('');
  const [servingGrams, setServingGrams] = useState('');

  const [query, setQuery] = useState('');
  const { results: searchResults } = useUnifiedSearch(query);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();

  function addIngredient(foodItem: FoodItem) {
    setIngredients((prev) => [...prev, { rowId: newId(), foodItem, grams: '100' }]);
    setQuery('');
  }

  function updateGrams(rowId: string, grams: string) {
    setIngredients((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, grams } : r)));
  }

  function removeIngredient(rowId: string) {
    setIngredients((prev) => prev.filter((r) => r.rowId !== rowId));
  }

  const yieldG = Number(totalYieldG) || 0;
  const rawTotal = computeRawTotal(
    ingredients.map((r) => ({ per100g: r.foodItem.per100g, grams: Number(r.grams) || 0 })),
  );
  const canPreview = yieldG > 0 && ingredients.length > 0;
  const per100g = canPreview ? computeMacrosForServing(rawTotal, yieldG, 100) : undefined;
  const perServingGramsNum = Number(servingGrams) || 0;
  const perServing =
    canPreview && perServingGramsNum > 0 ? computeMacrosForServing(rawTotal, yieldG, perServingGramsNum) : undefined;

  const canSave = displayName.trim() !== '' && ingredients.length > 0 && yieldG > 0 && ingredients.every((r) => (Number(r.grams) || 0) > 0);

  async function handleSave() {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    setSaveError(undefined);
    try {
      const item: CustomFoodItem = {
        id: newId(),
        displayName: displayName.trim(),
        source: 'custom',
        per100g: computeMacrosForServing(rawTotal, yieldG, 100),
        createdAt: new Date().toISOString(),
        isRecipe: true,
        ingredients: ingredients.map((r) => ({ foodItemId: r.foodItem.id, grams: Number(r.grams) || 0 })),
        totalYieldG: yieldG,
        ...(servingLabel.trim() !== '' && perServingGramsNum > 0
          ? { servingSuggestion: { label: servingLabel.trim(), grams: perServingGramsNum } }
          : {}),
      };
      await db.foodItems.put(item);
      onSaved?.(item);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this recipe.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-[100dvh] flex-col bg-bg text-ink">
      <header className="flex items-center gap-3 px-4 pt-4">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="rounded-full p-2 text-ink-muted hover:bg-surface-raised hover:text-ink"
          >
            ✕
          </button>
        )}
        <h1 className="text-lg font-semibold text-ink">New recipe</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-4">
        <div className="mb-5 flex flex-col gap-1.5">
          <label htmlFor="recipe-name" className="text-sm text-ink-muted">
            Recipe name
          </label>
          <input
            id="recipe-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Moong dal khichdi"
            className="rounded-xl border border-hairline bg-surface px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
        </div>

        <div className="mb-2 flex flex-col gap-1.5">
          <label htmlFor="ingredient-search" className="text-sm text-ink-muted">
            Add ingredients
          </label>
          <input
            id="ingredient-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search foods to add…"
            className="rounded-xl border border-hairline bg-surface px-3 py-2.5 text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
          {searchResults.length > 0 && (
            <div className="hairline-divide rounded-xl border border-hairline bg-surface-raised px-3">
              {searchResults.map((food) => (
                <button
                  key={food.id}
                  type="button"
                  onClick={() => addIngredient(food)}
                  className="flex w-full items-center justify-between gap-2 py-2.5 text-left"
                >
                  <span className="truncate text-sm text-ink">{food.displayName}</span>
                  <TagChip item={food} />
                </button>
              ))}
            </div>
          )}
          {query.trim() !== '' && searchResults.length === 0 && (
            <p className="text-xs text-ink-muted">
              No matches in your custom foods yet — the full food database lands once search is wired in.
            </p>
          )}
        </div>

        {ingredients.length > 0 && (
          <div className="hairline-divide mb-5 rounded-xl border border-hairline bg-surface px-3">
            {ingredients.map((row) => (
              <DetailRow
                key={row.rowId}
                label={row.foodItem.displayName}
                value={
                  <span className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={row.grams}
                      onChange={(e) => updateGrams(row.rowId, e.target.value)}
                      className="tabular w-14 bg-transparent text-right text-sm text-ink focus:outline-none"
                    />
                    <span className="text-xs text-ink-muted">g</span>
                  </span>
                }
                trailing={
                  <button
                    type="button"
                    onClick={() => removeIngredient(row.rowId)}
                    aria-label={`Remove ${row.foodItem.displayName}`}
                    className="px-1 text-ink-muted hover:text-accent-warn"
                  >
                    ✕
                  </button>
                }
              />
            ))}
          </div>
        )}

        <div className="mb-5 flex flex-col gap-1.5">
          <label htmlFor="total-yield" className="text-sm text-ink-muted">
            Total yield
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-hairline bg-surface px-3 py-2.5">
            <input
              id="total-yield"
              type="number"
              inputMode="decimal"
              value={totalYieldG}
              onChange={(e) => setTotalYieldG(e.target.value)}
              placeholder="0"
              className="tabular w-full bg-transparent text-ink placeholder:text-ink-muted focus:outline-none"
            />
            <span className="tabular text-sm text-ink-muted">g</span>
          </div>
          <p className="text-xs text-ink-muted">
            Weight of the finished dish — not the sum of raw ingredients, since cooking changes weight.
          </p>
        </div>

        <div className="mb-5 flex flex-col gap-1.5">
          <span className="text-sm text-ink-muted">Serving suggestion (optional)</span>
          <div className="flex gap-2">
            <input
              type="text"
              value={servingLabel}
              onChange={(e) => setServingLabel(e.target.value)}
              placeholder="e.g. 1 katori"
              className="flex-1 rounded-xl border border-hairline bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
            />
            <div className="flex items-center gap-2 rounded-xl border border-hairline bg-surface px-3 py-2.5">
              <input
                type="number"
                inputMode="decimal"
                value={servingGrams}
                onChange={(e) => setServingGrams(e.target.value)}
                placeholder="0"
                className="tabular w-16 bg-transparent text-ink placeholder:text-ink-muted focus:outline-none"
              />
              <span className="tabular text-sm text-ink-muted">g</span>
            </div>
          </div>
        </div>

        {canPreview && per100g && (
          <div className="mb-5">
            <p className="mb-2 text-sm text-ink-muted">Per 100g</p>
            <div className="grid grid-cols-4 gap-2">
              {populatedMacroFields(per100g)
                .filter((f) => f.def.headline)
                .map(({ def, value }) => (
                  <div key={def.key} className="rounded-xl border border-hairline bg-surface px-2 py-3 text-center">
                    <p className="tabular text-base font-semibold text-ink">{formatMacroValue(def, value)}</p>
                    <p className="text-[10px] uppercase tracking-wide text-ink-muted">{def.unit}</p>
                  </div>
                ))}
            </div>
            {perServing && (
              <p className="tabular mt-2 text-xs text-ink-muted">
                Per {servingLabel || `${servingGrams}g`}: {Math.round(perServing.kcal)} kcal
              </p>
            )}
          </div>
        )}

        {saveError && (
          <p className="mb-3 rounded-lg border border-accent-warn/40 px-3 py-2 text-xs text-accent-warn">
            {saveError}
          </p>
        )}
      </div>

      <footer className="border-t border-hairline px-4 py-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || isSaving}
          className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isSaving ? 'Saving…' : 'Save recipe'}
        </button>
      </footer>
    </div>
  );
}
