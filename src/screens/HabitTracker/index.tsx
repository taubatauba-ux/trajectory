import { useState } from 'react';
import {
  useHabitsData,
  createHabit,
  updateHabit,
  setHabitActive,
  toggleHabitEntry,
} from './useHabits';
import { computeHabitStreak } from './habitStats';
import { HabitRow } from './HabitRow';
import { HabitHistoryGrid } from './HabitHistoryGrid';
import { HabitFormSheet } from './HabitFormSheet';
import { todayISO } from '../_shared/dates';
import type { HabitDefinition } from '../../types';

type FormMode = { kind: 'create' } | { kind: 'edit'; habit: HabitDefinition } | null;

/**
 * Top-level, route-ready screen component for §9.9. Default export, zero required
 * props, self-contained data via useHabitsData/Dexie — ready for Part 3's router. No
 * nav chrome; see HistoryTrends/index.tsx's doc comment for the same convention.
 */
export default function HabitTracker() {
  const data = useHabitsData();
  const [formMode, setFormMode] = useState<FormMode>(null);
  const today = todayISO();

  if (!data) {
    return <p className="p-6 text-sm text-ink-muted">Loading habits…</p>;
  }

  const activeHabits = data.habits.filter((h) => h.active);
  const completedTodaySet = new Set(
    data.entries.filter((e) => e.date === today && e.completed).map((e) => e.habitId),
  );

  const closeForm = () => setFormMode(null);

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg text-ink">Habits</h1>
        {formMode === null && (
          <button
            type="button"
            onClick={() => setFormMode({ kind: 'create' })}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
          >
            + Add habit
          </button>
        )}
      </div>

      {formMode?.kind === 'create' && (
        <HabitFormSheet
          submitLabel="Add habit"
          onCancel={closeForm}
          onSubmit={(name, icon) => {
            void createHabit(name, icon);
            closeForm();
          }}
        />
      )}
      {formMode?.kind === 'edit' && (
        <HabitFormSheet
          submitLabel="Save changes"
          initialName={formMode.habit.name}
          initialIcon={formMode.habit.icon}
          onCancel={closeForm}
          onSubmit={(name, icon) => {
            void updateHabit(formMode.habit.id, { name, icon });
            closeForm();
          }}
        />
      )}

      <section>
        <h2 className="mb-1 text-sm text-ink-muted">Today</h2>
        {activeHabits.length === 0 ? (
          <p className="text-sm text-ink-muted">
            No active habits yet — add one above to start tracking today.
          </p>
        ) : (
          <div>
            {activeHabits.map((habit) => (
              <HabitRow
                key={habit.id}
                habit={habit}
                completedToday={completedTodaySet.has(habit.id)}
                streak={computeHabitStreak(data.entries, habit.id, today)}
                onToggleToday={() => void toggleHabitEntry(habit.id, today)}
              />
            ))}
          </div>
        )}
      </section>

      {activeHabits.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm text-ink-muted">Last 14 days</h2>
          <HabitHistoryGrid
            habits={activeHabits}
            entries={data.entries}
            today={today}
            onToggleCell={(habitId, date) => void toggleHabitEntry(habitId, date)}
          />
        </section>
      )}

      {data.habits.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm text-ink-muted">All habits</h2>
          <div className="flex flex-col">
            {data.habits.map((habit) => (
              <div
                key={habit.id}
                className="flex items-center gap-3 border-t border-hairline py-2.5 first:border-t-0"
              >
                <span className="w-6 shrink-0 text-center text-base">{habit.icon}</span>
                <span className={`flex-1 truncate text-sm ${habit.active ? 'text-ink' : 'text-ink-muted'}`}>
                  {habit.name}
                  {!habit.active && <span className="ml-2 text-xs">(inactive)</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setFormMode({ kind: 'edit', habit })}
                  className="text-xs text-ink-muted hover:text-ink"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void setHabitActive(habit.id, !habit.active)}
                  className="text-xs text-ink-muted hover:text-ink"
                >
                  {habit.active ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
