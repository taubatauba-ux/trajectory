import { useState } from 'react';
import type { PeriodEntry, PeriodFlow } from '../../types';
import { getMonthGrid, monthLabel, addMonths, todayISO } from '../_shared/dates';
import { colors } from '../../design/tokens';
import { hexToRgba } from '../_shared/color';

const FLOW_OPACITY: Record<PeriodFlow, number> = {
  spotting: 0.25,
  light: 0.45,
  medium: 0.7,
  heavy: 1,
};

interface MonthCalendarProps {
  entries: PeriodEntry[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

export function MonthCalendar({ entries, selectedDate, onSelectDate }: MonthCalendarProps) {
  const today = todayISO();
  const [{ year, monthIndex0 }, setCursor] = useState(() => {
    const [y, m] = today.split('-');
    return { year: Number(y), monthIndex0: Number(m) - 1 };
  });

  const entryByDate = new Map(entries.map((e) => [e.date, e]));
  const weeks = getMonthGrid(year, monthIndex0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(addMonths(year, monthIndex0, -1))}
          aria-label="Previous month"
          className="rounded-md px-2 py-1 text-ink-muted hover:text-ink"
        >
          ‹
        </button>
        <span className="font-mono text-sm tabular-nums text-ink">{monthLabel(year, monthIndex0)}</span>
        <button
          type="button"
          onClick={() => setCursor(addMonths(year, monthIndex0, 1))}
          aria-label="Next month"
          className="rounded-md px-2 py-1 text-ink-muted hover:text-ink"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-center font-mono text-[10px] text-ink-muted">
            {d}
          </div>
        ))}
        {weeks.flat().map((cell, i) => {
          if (!cell.dateISO) return <div key={i} />;
          const entry = entryByDate.get(cell.dateISO);
          const isToday = cell.dateISO === today;
          const isSelected = cell.dateISO === selectedDate;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDate(cell.dateISO!)}
              aria-label={cell.dateISO}
              aria-pressed={isSelected}
              style={isToday ? { boxShadow: `inset 0 0 0 1px ${hexToRgba(colors.accent, 0.5)}` } : undefined}
              className={`relative flex aspect-square items-center justify-center rounded-md text-xs transition-colors ${
                isSelected ? 'bg-surface-raised text-ink' : 'text-ink hover:bg-surface-raised'
              }`}
            >
              {Number(cell.dateISO.slice(8, 10))}
              {entry?.flow && (
                <span
                  className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-accent-warn"
                  style={{ opacity: FLOW_OPACITY[entry.flow] }}
                />
              )}
              {!entry?.flow && entry?.symptoms && entry.symptoms.length > 0 && (
                <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full border border-ink-muted" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
