import type { ReactNode } from 'react';
import type { FoodItem } from '../../types';
import type { FrequentFoodItem } from '../../lib/recents';
import { SearchResultRow } from '../../components/SearchResultRow';

export interface FavoriteWithItem {
  foodItem: FoodItem;
  gramsDefault: number;
}

interface RecentsAndFavoritesProps {
  favorites: FavoriteWithItem[];
  frequent: FrequentFoodItem[];
  favoriteFoodItemIds: Set<string>;
  onLog: (item: FoodItem, grams: number) => void;
  onToggleFavorite: (item: FoodItem, currentDefaultGrams: number) => void;
}

/** §9.2: "Recents & Favorites: shown by default when the search bar is empty —
 * most-logged items first, pinnable favorites with a remembered serving size."
 * Favorites get their own section (they're explicitly user-curated, so they lead), the
 * frequency-ranked list follows underneath. */
export function RecentsAndFavorites({
  favorites,
  frequent,
  favoriteFoodItemIds,
  onLog,
  onToggleFavorite,
}: RecentsAndFavoritesProps) {
  if (favorites.length === 0 && frequent.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-ink-muted">
        Search above to log your first food — favorites and frequently-logged items will
        show up here.
      </div>
    );
  }

  return (
    <div>
      {favorites.length > 0 && (
        <Section title="Favorites">
          {favorites.map(({ foodItem, gramsDefault }) => (
            <SearchResultRow
              key={foodItem.id}
              item={foodItem}
              isFavorite
              defaultGrams={gramsDefault}
              onLog={onLog}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </Section>
      )}
      {frequent.length > 0 && (
        <Section title="Frequently logged">
          {frequent.map(({ foodItem }) => (
            <SearchResultRow
              key={foodItem.id}
              item={foodItem}
              isFavorite={favoriteFoodItemIds.has(foodItem.id)}
              onLog={onLog}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="px-4 pb-1.5 pt-4 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
        {title}
      </div>
      {children}
    </div>
  );
}
