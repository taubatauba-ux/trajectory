import { useHabitsData, toggleHabitEntry } from './useHabits';
import { todayISO } from '../_shared/dates';
import { colors } from '../../design/tokens';
import { hexToRgba } from '../_shared/color';

interface HabitStripProps {
  /** Defaults to today; exposed mainly for tests/storybook-style pinning. */
  date?: string;
}

/**
 * Compact row of today's active habits as tappable circles — built for Part 3's
 * Dashboard (§9.2 mentions a "compact strip"; §9.9 says the full grid lives on this
 * screen instead). Self-contained: fetches its own data and writes its own toggles, no
 * required props, so it can be dropped in as `<HabitStrip />` once Part 3's Dashboard
 * exists, without Part 3 needing to know anything about Habit Tracker's internals.
 * Deliberately kept inside HabitTracker/ rather than src/components/ — see
 * PART5_PROGRESS_REPORT.md's note on avoiding src/components/ naming collisions with
 * Part 3's own "shared components" work happening in parallel.
 */
export function HabitStrip({ date }: HabitStripProps) {
  const data = useHabitsData();
  const today = date ?? todayISO();

  if (!data || data.habits.length === 0) return null;
  const activeHabits = data.habits.filter((h) => h.active);
  if (activeHabits.length === 0) return null;

  const completedToday = new Set(
    data.entries.filter((e) => e.date === today && e.completed).map((e) => e.habitId),
  );

  return (
    <div className="flex gap-2 overflow-x-auto py-1">
      {activeHabits.map((habit) => {
        const done = completedToday.has(habit.id);
        return (
          <button
            key={habit.id}
            type="button"
            onClick={() => void toggleHabitEntry(habit.id, today)}
            aria-pressed={done}
            aria-label={`Mark ${habit.name} ${done ? 'not done' : 'done'} for today`}
            title={habit.name}
            style={done ? { backgroundColor: hexToRgba(colors.accent, 0.15) } : undefined}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-base transition-colors ${
              done ? 'border-accent text-accent' : 'border-hairline text-ink-muted'
            }`}
          >
            {habit.icon ?? habit.name.slice(0, 1).toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}
