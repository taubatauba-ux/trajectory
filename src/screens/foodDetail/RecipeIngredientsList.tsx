// §9.4: "For recipes: expandable ingredient list." Native <details>/<summary> — no extra
// JS state needed for "expandable", and it's keyboard/screen-reader accessible for free.
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../data/db';
import { DetailRow } from '../../components/DetailRow';
import type { RecipeIngredient } from '../../types/food';

export interface RecipeIngredientsListProps {
  ingredients: RecipeIngredient[];
}

export function RecipeIngredientsList({ ingredients }: RecipeIngredientsListProps) {
  const resolved = useLiveQuery(async () => {
    const items = await db.foodItems.bulkGet(ingredients.map((i) => i.foodItemId));
    return ingredients.map((ing, i) => ({ ingredient: ing, foodItem: items[i] }));
  }, [ingredients]);

  return (
    <details className="rounded-xl border border-hairline bg-surface open:pb-1">
      <summary className="cursor-pointer list-none px-3 py-3 text-sm font-medium text-ink">
        Ingredients ({ingredients.length})
      </summary>
      <div className="hairline-divide px-3">
        {(resolved ?? []).map(({ ingredient, foodItem }, i) => (
          <DetailRow
            key={`${ingredient.foodItemId}-${i}`}
            label={foodItem?.displayName ?? 'Unknown ingredient'}
            value={<span className="tabular">{ingredient.grams}g</span>}
          />
        ))}
      </div>
    </details>
  );
}
