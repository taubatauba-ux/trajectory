import { db } from './db';
import type { FoodItem } from '../types';

// Part 3 addition, NOT §5's real ICMR/OFF datasets. Part 2 (parallel session, per
// PROGRESS_REPORT.md) owns extract_icmr.py / import_off_bulk.py, which will populate
// `foodItems` with the real ~528-item IFCT set plus a live OFF cache. Until that lands,
// this bundle ships with an empty catalog, which makes every screen this part builds
// impossible to actually demo — an empty search box that always returns nothing looks
// broken, not "correctly waiting for data".
//
// So: a small, clearly-illustrative set of common foods across all three `source`
// values, seeded ONLY when `foodItems` is completely empty. The moment Part 2's import
// script runs and populates real rows, this function's guard condition stops firing and
// this file becomes inert — no manual cleanup step needed, nothing to remember to
// delete. Macro values here are commonly-cited approximate figures for well-known foods,
// good enough to make the UI feel real; they are NOT sourced from IFCT 2017 and must
// not be treated as authoritative. ifctCode values are sequential placeholders, not
// real §5.5 codes (this file doesn't know the real group-to-letter scheme).
const DEMO_FOOD_ITEMS: FoodItem[] = [
  icmr('demo-icmr-1', 'A001', 'Rice, cooked', 'Cereals and Millets', {
    kcal: 130, proteinG: 2.7, fatG: 0.3, carbG: 28, fiberG: 0.4,
  }, { label: '1 katori', grams: 150 }),
  icmr('demo-icmr-2', 'A002', 'Chapati / roti, whole wheat', 'Cereals and Millets', {
    kcal: 120, proteinG: 3.1, fatG: 3.2, carbG: 18.5, fiberG: 2.2,
  }, { label: '1 medium', grams: 40 }),
  icmr('demo-icmr-3', 'A003', 'Toor dal, cooked', 'Pulses and Legumes', {
    kcal: 120, proteinG: 7.2, fatG: 0.4, carbG: 20, fiberG: 5,
  }, { label: '1 katori', grams: 150 }),
  icmr('demo-icmr-4', 'A004', 'Moong dal, cooked', 'Pulses and Legumes', {
    kcal: 105, proteinG: 7.5, fatG: 0.4, carbG: 17, fiberG: 4.5,
  }, { label: '1 katori', grams: 150 }),
  icmr('demo-icmr-5', 'A005', 'Paneer', 'Milk and Milk Products', {
    kcal: 265, proteinG: 18.3, fatG: 20.8, carbG: 1.2,
  }, { label: '1 cube (~25g)', grams: 25 }),
  icmr('demo-icmr-6', 'A006', 'Curd / dahi, plain', 'Milk and Milk Products', {
    kcal: 60, proteinG: 3.5, fatG: 4, carbG: 4.7,
  }, { label: '1 katori', grams: 150 }),
  icmr('demo-icmr-7', 'A007', 'Milk, toned', 'Milk and Milk Products', {
    kcal: 58, proteinG: 3.2, fatG: 3, carbG: 4.7,
  }, { label: '1 glass', grams: 200 }),
  icmr('demo-icmr-8', 'A008', 'Egg, boiled', 'Egg', {
    kcal: 155, proteinG: 13, fatG: 11, carbG: 1.1,
  }, { label: '1 large egg', grams: 50 }),
  icmr('demo-icmr-9', 'A009', 'Chicken curry, home-style', 'Meat and Poultry', {
    kcal: 180, proteinG: 15.5, fatG: 11, carbG: 5,
  }, { label: '1 katori', grams: 150 }),
  icmr('demo-icmr-10', 'A010', 'Banana', 'Fruits', {
    kcal: 89, proteinG: 1.1, fatG: 0.3, carbG: 23, fiberG: 2.6, sugarG: 12,
  }, { label: '1 medium', grams: 118 }),
  icmr('demo-icmr-11', 'A011', 'Apple', 'Fruits', {
    kcal: 52, proteinG: 0.3, fatG: 0.2, carbG: 14, fiberG: 2.4, sugarG: 10,
  }, { label: '1 medium', grams: 182 }),
  icmr('demo-icmr-12', 'A012', 'Almonds', 'Nuts and Oilseeds', {
    kcal: 579, proteinG: 21, fatG: 50, carbG: 22, fiberG: 12.5,
  }, { label: '10 almonds', grams: 12 }),
  icmr('demo-icmr-13', 'A013', 'Potato, boiled', 'Roots and Tubers', {
    kcal: 87, proteinG: 1.9, fatG: 0.1, carbG: 20, fiberG: 1.8,
  }, { label: '1 medium', grams: 170 }),
  icmr('demo-icmr-14', 'A014', 'Spinach, cooked', 'Vegetables', {
    kcal: 23, proteinG: 2.9, fatG: 0.4, carbG: 3.6, fiberG: 2.2, ironMg: 3.6,
  }, { label: '1 katori', grams: 150 }),
  icmr('demo-icmr-15', 'A015', 'Idli', 'Cereals and Millets', {
    kcal: 132, proteinG: 4, fatG: 0.5, carbG: 27,
  }, { label: '1 piece', grams: 40 }),
  icmr('demo-icmr-16', 'A016', 'Sambar', 'Pulses and Legumes', {
    kcal: 70, proteinG: 3.2, fatG: 2, carbG: 10,
  }, { label: '1 katori', grams: 150 }),

  off('demo-off-1', 'Maggi 2-Minute Noodles (Masala)', 'Nestlé', '8901058851557', {
    kcal: 455, proteinG: 9.3, fatG: 17.2, carbG: 64.4, sodiumMg: 1855,
  }, { label: '1 packet dry', grams: 70 }),
  off('demo-off-2', 'Parle-G Biscuits', 'Parle', '8901719110016', {
    kcal: 450, proteinG: 7.1, fatG: 14.6, carbG: 73.9, sugarG: 26,
  }, { label: '4 biscuits', grams: 24 }),
  off('demo-off-3', 'Amul Toned Milk', 'Amul', '8901262010017', {
    kcal: 58, proteinG: 3.2, fatG: 3, carbG: 4.7,
  }, { label: '1 packet', grams: 500 }),
  off('demo-off-4', 'Britannia Brown Bread', 'Britannia', '8901063015016', {
    kcal: 252, proteinG: 9.6, fatG: 2.9, carbG: 47, fiberG: 5.5,
  }, { label: '1 slice', grams: 27 }),
  off('demo-off-5', "Lay's Classic Salted Chips", 'Lays', '8901719102011', {
    kcal: 536, proteinG: 6.6, fatG: 34.7, carbG: 52.9, sodiumMg: 640,
  }, { label: '1 small pack', grams: 26 }),
  off('demo-off-6', 'Greek Yogurt, plain', 'Epigamia', '8904164501015', {
    kcal: 97, proteinG: 9.7, fatG: 5, carbG: 3.6, sugarG: 3.6,
  }, { label: '1 cup', grams: 90 }),

  custom('demo-custom-1', 'Sprouts salad (my mix)', {
    kcal: 145, proteinG: 9.2, fatG: 3.8, carbG: 19, fiberG: 6,
  }, { label: '1 bowl', grams: 180 }),
  custom('demo-custom-2', 'Post-workout protein shake', {
    kcal: 160, proteinG: 25, fatG: 2.5, carbG: 10,
  }, { label: '1 shaker', grams: 300 }),
];

function icmr(
  id: string,
  ifctCode: string,
  displayName: string,
  foodGroup: string,
  per100g: FoodItem['per100g'],
  servingSuggestion: { label: string; grams: number },
): FoodItem {
  return { id, displayName, source: 'icmr', per100g, servingSuggestion, ifctCode, foodGroup };
}

function off(
  id: string,
  displayName: string,
  brand: string,
  barcode: string,
  per100g: FoodItem['per100g'],
  servingSuggestion: { label: string; grams: number },
): FoodItem {
  return {
    id,
    displayName,
    source: 'off',
    per100g,
    servingSuggestion,
    brand,
    barcode,
    offId: barcode,
    lastSyncedAt: new Date('2026-07-01T00:00:00Z').toISOString(),
  };
}

function custom(
  id: string,
  displayName: string,
  per100g: FoodItem['per100g'],
  servingSuggestion: { label: string; grams: number },
): FoodItem {
  return {
    id,
    displayName,
    source: 'custom',
    per100g,
    servingSuggestion,
    createdAt: new Date('2026-07-01T00:00:00Z').toISOString(),
    isRecipe: false,
  };
}

/** Seeds the illustrative catalog above iff `foodItems` is completely empty. Safe to
 * call on every app start — it's a no-op (one indexed count query) once any real data
 * exists, whether that's Part 2's import or the user's own custom foods. */
export async function seedDemoFoodDataIfEmpty(): Promise<void> {
  const count = await db.foodItems.count();
  if (count > 0) return;
  await db.foodItems.bulkPut(DEMO_FOOD_ITEMS);
}
