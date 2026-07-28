import type { HabitDefinition, HabitEntry } from '../../types';
import { addDaysISO, enumerateDatesISO, formatWeekdayAbbr } from '../_shared/dates';
import { completedDatesForHabit } from './habitStats';

interface HabitHistoryGridProps {
  habits: HabitDefinition[];
  entries: HabitEntry[];
  today: string;
  days?: number;
  onToggleCell: (habitId: string, date: string) => void;
}

/** Trailing-`days` × habits grid. Cells are tappable — §9.9 calls for a check-off that
 * works retroactively as well as for "today", and this grid is the natural place for
 * that (rather than a separate edit mode), since toggleHabitEntry (useHabits.ts) is
 * already a plain flip regardless of which date it's called for. */
export function HabitHistoryGrid({ habits, entries, today, days = 14, onToggleCell }: HabitHistoryGridProps) {
  const dateColumns = enumerateDatesISO(addDaysISO(today, -(days - 1)), today);

  if (habits.length === 0) {
    return <p className="text-sm text-ink-muted">Add a habit above to start seeing history here.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="w-24 text-left" />
            {dateColumns.map((date) => (
              <th key={date} className="px-0.5 pb-1 text-center font-normal">
                <div className="font-mono text-[9px] uppercase tabular-nums text-ink-muted">
                  {formatWeekdayAbbr(date).slice(0, 1)}
                </div>
                <div className="font-mono text-[10px] tabular-nums text-ink-muted">
                  {Number(date.slice(8, 10))}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {habits.map((habit) => {
            const completed = completedDatesForHabit(entries, habit.id);
            return (
              <tr key={habit.id} className="border-t border-hairline">
                <td className="max-w-[6rem] truncate py-1.5 pr-2 text-xs text-ink" title={habit.name}>
                  <span className="mr-1">{habit.icon}</span>
                  {habit.name}
                </td>
                {dateColumns.map((date) => {
                  const isDone = completed.has(date);
                  return (
                    <td key={date} className="p-0.5 text-center">
                      <button
                        type="button"
                        onClick={() => onToggleCell(habit.id, date)}
                        aria-pressed={isDone}
                        aria-label={`${habit.name}, ${date}, ${isDone ? 'completed' : 'not completed'}`}
                        className={`h-4 w-4 rounded-sm border transition-colors ${
                          isDone ? 'border-accent bg-accent' : 'border-hairline bg-transparent hover:border-ink-muted'
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
