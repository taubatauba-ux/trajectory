import { useState } from 'react';
import { colors } from '../../design/tokens';
import { hexToRgba } from '../_shared/color';

const ICON_PRESETS = ['💧', '🏋️', '😴', '🧘', '🚶', '💊', '🥗', '🚭', '📖', '☀️', '🧴', '🦷'];

interface HabitFormSheetProps {
  initialName?: string;
  initialIcon?: string;
  submitLabel: string;
  onSubmit: (name: string, icon: string | undefined) => void;
  onCancel: () => void;
}

/** Inline card, not a modal — this project has no overlay/portal component yet (see
 * PART5_PROGRESS_REPORT.md), and a habit has exactly two fields, so a dedicated overlay
 * would be more machinery than the task needs. Used for both create and edit; the
 * caller decides which via `initialName`/`initialIcon`/`submitLabel`. */
export function HabitFormSheet({ initialName = '', initialIcon, submitLabel, onSubmit, onCancel }: HabitFormSheetProps) {
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState<string | undefined>(initialIcon);
  const trimmedEmpty = name.trim().length === 0;

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmedEmpty) return;
        onSubmit(name.trim(), icon);
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Habit name</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Drink water"
          maxLength={60}
          className="rounded-md border border-hairline bg-bg px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
        />
      </label>

      <div>
        <span className="mb-1.5 block text-xs text-ink-muted">Icon (optional)</span>
        <div className="flex flex-wrap gap-1.5">
          {ICON_PRESETS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setIcon(icon === emoji ? undefined : emoji)}
              aria-pressed={icon === emoji}
              style={icon === emoji ? { backgroundColor: hexToRgba(colors.accent, 0.15) } : undefined}
              className={`flex h-9 w-9 items-center justify-center rounded-md border text-base transition-colors ${
                icon === emoji ? 'border-accent' : 'border-hairline hover:border-ink-muted'
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={trimmedEmpty}
          className="rounded-md bg-accent px-3 py-1.5 text-xs text-bg disabled:opacity-40"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
