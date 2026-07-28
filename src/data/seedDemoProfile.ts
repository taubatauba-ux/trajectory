import { db } from './db';
import type { UserProfile, WeighIn, LogEntry } from '../types';
import { scaleMacros } from '../lib/macros';

// Unlike seedDemoFoodDataIfEmpty (catalog/reference data, safe to auto-seed), this file
// fabricates a *person* — a fake age, weight history, goal. Auto-creating that the
// moment a real user's `profile` table happens to be empty would silently misrepresent
// them, and real onboarding (§9.1, Part 4) now exists to ask who they actually are — so
// this function is intentionally not wired into the router as of integration. It's kept
// (working, tested) as the natural seed for a future explicit "try a demo" entry point
// (Settings, §9.12/Part 6, is the likely home) rather than deleted outright.
//
// 21 days of history (past MIN_DAYS_FOR_CONFIDENCE=7, adaptiveTdeeEngine.ts) with
// hand-authored noisy-but-trending weigh-ins, so a fresh demo shows a converged engine
// response rather than an immediate "insufficient_data" flag. Nothing is seeded for
// today — the empty "log your first thing today" state is itself worth seeing, and is
// the realistic state for opening the app on any given morning.

function daysAgoISO(n: number, now: Date): string {
  // UTC throughout (setUTCDate + toISOString), matching todayISO's convention
  // (lib/dateUtils.ts) — mixing local getDate()/setDate() with UTC toISOString() here
  // would silently shift by a day for any reader whose local clock is far enough from
  // UTC to be on a different calendar date at the moment this runs.
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

// Noisy-but-downward 21-day trend (~72.6kg -> ~71.0kg), oldest first, index 0 = 21 days
// ago through index 20 = yesterday. Real, not perfectly monotonic — a straight line
// wouldn't exercise the Kalman smoothing the engine actually does.
const WEIGHT_SEQUENCE_KG = [
  72.6, 72.4, 72.7, 72.3, 72.5, 72.1, 72.2, 71.9, 72.0, 71.8, 71.6, 71.9, 71.5, 71.7, 71.4,
  71.3, 71.5, 71.2, 71.1, 71.3, 71.0,
];

interface MealItem {
  foodItemId: string;
  grams: number;
}

const BREAKFAST_OPTIONS: MealItem[][] = [
  [{ foodItemId: 'demo-icmr-15', grams: 120 }, { foodItemId: 'demo-icmr-16', grams: 100 }],
  [{ foodItemId: 'demo-icmr-8', grams: 100 }, { foodItemId: 'demo-icmr-2', grams: 40 }],
  [{ foodItemId: 'demo-off-6', grams: 90 }, { foodItemId: 'demo-icmr-10', grams: 118 }],
];
const LUNCH_OPTIONS: MealItem[][] = [
  [
    { foodItemId: 'demo-icmr-1', grams: 150 },
    { foodItemId: 'demo-icmr-3', grams: 150 },
    { foodItemId: 'demo-icmr-14', grams: 100 },
  ],
  [{ foodItemId: 'demo-icmr-2', grams: 80 }, { foodItemId: 'demo-icmr-9', grams: 150 }],
];
const SNACK_OPTIONS: MealItem[][] = [
  [{ foodItemId: 'demo-icmr-11', grams: 182 }],
  [{ foodItemId: 'demo-icmr-12', grams: 24 }],
  [{ foodItemId: 'demo-custom-2', grams: 300 }],
];
const DINNER_OPTIONS: MealItem[][] = [
  [
    { foodItemId: 'demo-icmr-2', grams: 80 },
    { foodItemId: 'demo-icmr-5', grams: 60 },
    { foodItemId: 'demo-icmr-14', grams: 100 },
  ],
  [{ foodItemId: 'demo-icmr-1', grams: 100 }, { foodItemId: 'demo-icmr-4', grams: 150 }],
  [{ foodItemId: 'demo-custom-1', grams: 180 }, { foodItemId: 'demo-icmr-6', grams: 100 }],
];

async function buildLogEntriesForDay(
  dayIndex: number,
  date: string,
  foodItemsById: Map<string, { per100g: LogEntry['macrosAtLogTime'] }>,
): Promise<LogEntry[]> {
  const meals: { time: string; items: MealItem[] }[] = [
    { time: '08:15:00', items: BREAKFAST_OPTIONS[dayIndex % BREAKFAST_OPTIONS.length]! },
    { time: '13:15:00', items: LUNCH_OPTIONS[dayIndex % LUNCH_OPTIONS.length]! },
    { time: '17:00:00', items: SNACK_OPTIONS[dayIndex % SNACK_OPTIONS.length]! },
    { time: '20:30:00', items: DINNER_OPTIONS[dayIndex % DINNER_OPTIONS.length]! },
  ];

  const entries: LogEntry[] = [];
  let mealIndex = 0;
  for (const meal of meals) {
    let itemIndex = 0;
    for (const item of meal.items) {
      const food = foodItemsById.get(item.foodItemId);
      if (!food) continue; // defensive — seedDemoFoodDataIfEmpty should always run first
      entries.push({
        id: `demo-log-${dayIndex}-${mealIndex}-${itemIndex}`,
        date,
        loggedAt: `${date}T${meal.time}`,
        foodItemId: item.foodItemId,
        grams: item.grams,
        macrosAtLogTime: scaleMacros(food.per100g, item.grams),
      });
      itemIndex += 1;
    }
    mealIndex += 1;
  }
  return entries;
}

/** Creates a demo profile + 21 days of weigh-ins and logs. Assumes
 * seedDemoFoodDataIfEmpty() has already run (called together in the "load demo data"
 * action) — if the food catalog is somehow still empty, meal entries referencing it are
 * silently skipped rather than throwing, so this never crashes into a half-broken state. */
export async function seedDemoProfileAndHistory(now: Date = new Date()): Promise<void> {
  const dobDate = new Date(now);
  dobDate.setUTCFullYear(dobDate.getUTCFullYear() - 29);

  const profile: UserProfile = {
    id: 'demo-user',
    sex: 'female',
    dateOfBirth: dobDate.toISOString().slice(0, 10),
    heightCm: 165,
    goal: { type: 'cut', targetWeightKg: 65 },
    measurements: {},
    activityNote: 'Moderately active — walks daily, gym three times a week.',
    createdAt: daysAgoISO(21, now) + 'T09:00:00.000Z',
    updatedAt: daysAgoISO(21, now) + 'T09:00:00.000Z',
  };
  await db.profile.put(profile);

  const weighIns: WeighIn[] = WEIGHT_SEQUENCE_KG.map((weightKg, i) => ({
    id: `demo-weighin-${i}`,
    date: daysAgoISO(WEIGHT_SEQUENCE_KG.length - i, now),
    weightKg,
  }));
  await db.weighIns.bulkPut(weighIns);

  const foodItems = await db.foodItems.toArray();
  const foodItemsById = new Map(foodItems.map((f) => [f.id, f]));

  const allEntries: LogEntry[] = [];
  for (let dayIndex = 0; dayIndex < 21; dayIndex++) {
    const date = daysAgoISO(21 - dayIndex, now);
    const entries = await buildLogEntriesForDay(dayIndex, date, foodItemsById);
    allEntries.push(...entries);
  }
  await db.logEntries.bulkPut(allEntries);
}
