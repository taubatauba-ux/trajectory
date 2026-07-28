import { useState } from 'react';
import { usePeriodEntries, setDayEntry } from './usePeriodEntries';
import { computeCycleStats } from './cycleStats';
import { MonthCalendar } from './MonthCalendar';
import { DayEntrySheet } from './DayEntrySheet';
import { todayISO, formatDisplayDate, daysBetweenISO } from '../_shared/dates';

/**
 * Top-level, route-ready screen component for §9.10. Default export, zero required
 * props, self-contained via usePeriodEntries/Dexie — ready for Part 3's router. No nav
 * chrome; see HistoryTrends/index.tsx's doc comment for the same convention.
 *
 * §9.10 frames this as "independent of nutrition loop but stored in same local DB" —
 * this screen makes no EngineRequest call and doesn't touch engine.types.ts at all.
 * Whether/how period data should eventually feed the Engine (adaptive-tdee-engine-spec-v2.md
 * doesn't mention it) is explicitly out of scope here, not an oversight.
 */
export default function PeriodTracker() {
  const entries = usePeriodEntries();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = todayISO();

  if (!entries) {
    return <p className="p-6 text-sm text-ink-muted">Loading…</p>;
  }

  const stats = computeCycleStats(entries, today);
  const existingForSelected = selectedDate
    ? entries.find((e) => e.date === selectedDate)
    : undefined;

  return (
    <div className="flex flex-col gap-6 pb-8">
      <h1 className="text-lg text-ink">Period Tracker</h1>

      <div className="rounded-lg bg-surface p-4">
        {stats.episodes.length === 0 ? (
          <p className="text-sm text-ink-muted">
            Tap a date below to log flow or symptoms. Cycle stats will show up here once
            you've logged at least one period.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-ink-muted">Current cycle</span>
              <span className="font-mono text-sm tabular-nums text-ink">
                {stats.currentCycleDay !== null ? `Day ${stats.currentCycleDay}` : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between border-t border-hairline pt-3">
              <span className="text-sm text-ink-muted">Predicted next period</span>
              <span className="font-mono text-sm tabular-nums text-ink">
                {stats.predictedNextStart ? formatNextStart(stats.predictedNextStart, today) : 'Not enough history yet'}
              </span>
            </div>
            <div className="flex items-baseline justify-between border-t border-hairline pt-3">
              <span className="text-sm text-ink-muted">Avg. cycle length</span>
              <span className="font-mono text-sm tabular-nums text-ink">
                {stats.avgCycleLengthDays !== null ? `${Math.round(stats.avgCycleLengthDays)} days` : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between border-t border-hairline pt-3">
              <span className="text-sm text-ink-muted">Avg. period length</span>
              <span className="font-mono text-sm tabular-nums text-ink">
                {stats.avgPeriodLengthDays !== null ? `${Math.round(stats.avgPeriodLengthDays)} days` : '—'}
              </span>
            </div>
            <p className="border-t border-hairline pt-3 text-xs text-ink-muted">
              A rough estimate from your own logged history, not a clinical prediction —
              expect it to be off by a few days, especially with fewer than 3-4 cycles logged.
            </p>
          </div>
        )}
      </div>

      <MonthCalendar entries={entries} selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      {selectedDate && (
        <DayEntrySheet
          date={selectedDate}
          existing={existingForSelected}
          onSave={(input) => void setDayEntry(selectedDate, input)}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}

function formatNextStart(predictedISO: string, today: string): string {
  const daysAway = daysBetweenISO(today, predictedISO);
  const dateLabel = formatDisplayDate(predictedISO);
  if (daysAway === 0) return `${dateLabel} (today)`;
  if (daysAway > 0) return `${dateLabel} (in ${daysAway}d)`;
  return `${dateLabel} (${Math.abs(daysAway)}d ago)`;
}
