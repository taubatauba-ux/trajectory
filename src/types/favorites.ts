// Not an explicit interface in trajectory-app-technical-specification.md — §9.2 requires
// "pinnable favorites with a remembered serving size" but §4 (Data Model) never defines a
// shape for this. Same situation as media.ts's ProgressPhoto (Part 1): the screen spec
// implies a concrete record the data-model spec omits, so this is a Part 3 extension,
// flagged here rather than silently folded into an existing interface.
//
// Why a separate table instead of an `isFavorite` boolean on FoodItem: a favorite needs
// its own remembered gram amount (§9.2), which isn't a property of the food itself — the
// same dal can be favorited at "1 katori" by one habit and a different amount another
// time. Modeling it as its own record also means favoriting never mutates FoodItemBase,
// which every source (§4.2) already treats as effectively immutable/source-owned data.
export interface Favorite {
  id: string;
  foodItemId: string;
  /** The remembered serving size (§9.2) — what quick-add uses without asking again. */
  gramsDefault: number;
  /** ISO timestamp — drives display order (most recently pinned first). */
  pinnedAt: string;
}
