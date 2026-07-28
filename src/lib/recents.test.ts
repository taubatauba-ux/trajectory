import { describe, it, expect } from 'vitest';
import { computeFrequentFoodItems } from './recents';
import type { LogEntry, FoodItem } from '../types';

const MACROS = { kcal: 100, proteinG: 5, fatG: 2, carbG: 15 };

function makeEntry(id: string, foodItemId: string, loggedAt: string): LogEntry {
  return { id, date: loggedAt.slice(0, 10), loggedAt, foodItemId, grams: 100, macrosAtLogTime: MACROS };
}

function makeFood(id: string, displayName: string): FoodItem {
  return { id, displayName, source: 'custom', per100g: MACROS, createdAt: '2026-01-01T00:00:00', isRecipe: false };
}

describe('computeFrequentFoodItems', () => {
  const dal = makeFood('food-dal', 'Dal');
  const rice = makeFood('food-rice', 'Rice');
  const roti = makeFood('food-roti', 'Roti');
  const foodItemsById = new Map([
    ['food-dal', dal],
    ['food-rice', rice],
    ['food-roti', roti],
  ]);

  it('ranks by log count descending — most-logged first (§9.2)', () => {
    const entries: LogEntry[] = [
      makeEntry('1', 'food-dal', '2026-07-01T08:00:00'),
      makeEntry('2', 'food-dal', '2026-07-02T08:00:00'),
      makeEntry('3', 'food-dal', '2026-07-03T08:00:00'),
      makeEntry('4', 'food-rice', '2026-07-01T08:00:00'),
      makeEntry('5', 'food-rice', '2026-07-02T08:00:00'),
      makeEntry('6', 'food-roti', '2026-07-01T08:00:00'),
    ];
    const result = computeFrequentFoodItems(entries, foodItemsById);
    expect(result.map((r) => r.foodItem.id)).toEqual(['food-dal', 'food-rice', 'food-roti']);
    expect(result[0]?.logCount).toBe(3);
  });

  it('breaks ties by most recently logged', () => {
    const entries: LogEntry[] = [
      makeEntry('1', 'food-dal', '2026-07-01T08:00:00'),
      makeEntry('2', 'food-rice', '2026-07-05T08:00:00'),
    ];
    const result = computeFrequentFoodItems(entries, foodItemsById);
    expect(result.map((r) => r.foodItem.id)).toEqual(['food-rice', 'food-dal']);
  });

  it('respects the limit', () => {
    const entries: LogEntry[] = [
      makeEntry('1', 'food-dal', '2026-07-01T08:00:00'),
      makeEntry('2', 'food-rice', '2026-07-01T08:00:00'),
      makeEntry('3', 'food-roti', '2026-07-01T08:00:00'),
    ];
    const result = computeFrequentFoodItems(entries, foodItemsById, 2);
    expect(result).toHaveLength(2);
  });

  it('skips log entries whose food item no longer resolves, without throwing', () => {
    const entries: LogEntry[] = [
      makeEntry('1', 'food-deleted', '2026-07-01T08:00:00'),
      makeEntry('2', 'food-dal', '2026-07-01T08:00:00'),
    ];
    const result = computeFrequentFoodItems(entries, foodItemsById);
    expect(result.map((r) => r.foodItem.id)).toEqual(['food-dal']);
  });

  it('returns an empty array for no history', () => {
    expect(computeFrequentFoodItems([], foodItemsById)).toEqual([]);
  });
});
