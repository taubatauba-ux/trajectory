import type { HabitDefinition } from '../../types';
import { colors } from '../../design/tokens';
import { hexToRgba } from '../_shared/color';

interface HabitRowProps {
  habit: HabitDefinition;
  completedToday: boolean;
  streak: number;
  onToggleToday: () => void;
}

export function HabitRow({ habit, completedToday, streak, onToggleToday }: HabitRowProps) {
  return (
    <div className="flex items-center gap-3 border-t border-hairline py-3 first:border-t-0">
      <button
        type="button"
        onClick={onToggleToday}
        aria-pressed={completedToday}
        aria-label={`Mark ${habit.name} ${completedToday ? 'not done' : 'done'} for today`}
        style={completedToday ? { backgroundColor: hexToRgba(colors.accent, 0.15) } : undefined}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-xl transition-colors ${
          completedToday
            ? 'border-accent text-accent'
            : 'border-hairline text-ink-muted hover:border-ink-muted'
        }`}
      >
        {habit.icon ?? (completedToday ? '✓' : '')}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{habit.name}</p>
        <p className="font-mono text-xs tabular-nums text-ink-muted">
          {streak > 0 ? `${streak} day${streak === 1 ? '' : 's'} streak` : 'No streak yet'}
        </p>
      </div>
    </div>
  );
}
