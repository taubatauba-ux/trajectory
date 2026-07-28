import { useMemo, useState } from 'react';
import { useEngineHistory } from './useEngineHistory';
import {
  buildWeightTrendSeries,
  buildRawWeighInSeries,
  buildExpenditureSeries,
  filterByRange,
  type ChartRange,
} from './chartData';
import {
  reconstructHistoricalTargets,
  computeLoggedDaysStreak,
  computeAdherenceForWindow,
} from './adherence';
import { buildHistoryCsv, downloadCsv } from './csvExport';
import { WeightTrendChart } from './WeightTrendChart';
import { ExpenditureChart } from './ExpenditureChart';
import { AdherencePanel } from './AdherencePanel';
import { RangeSelector } from './RangeSelector';
import { todayISO } from '../_shared/dates';

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg bg-surface px-6 py-12 text-center">
      <h2 className="text-base text-ink">{title}</h2>
      <p className="max-w-xs text-sm text-ink-muted">{body}</p>
    </div>
  );
}

/**
 * Top-level, route-ready screen component for §9.8. Default export, zero required
 * props — self-contained (fetches its own data via useEngineHistory/Dexie) so Part 3's
 * router can mount it directly, e.g. `<Route path="/history" element={<HistoryTrends />} />`,
 * once that router exists. Renders only its own content area; no nav chrome/header/back
 * button, since wrapping that around routed screens is the navigation shell's job.
 */
export default function HistoryTrends() {
  const history = useEngineHistory();
  const [range, setRange] = useState<ChartRange>(90);

  // Hooks must run unconditionally regardless of `history.status`, so the derived-data
  // memo runs every render and returns null itself when there's nothing to derive from.
  const derived = useMemo(() => {
    if (history.status !== 'ready') return null;
    const { debug, weighIns, dailyTotals } = history;

    const trendFull = buildWeightTrendSeries(debug.replay);
    const rawFull = buildRawWeighInSeries(debug.replay, weighIns);
    // One shared anchor for both series — see chartData.ts's filterByRange comment for
    // why filtering them independently would silently misalign the two.
    const anchorDate = trendFull[trendFull.length - 1]?.date ?? todayISO();
    const trend = filterByRange(trendFull, range, anchorDate);
    const raw = filterByRange(rawFull, range, anchorDate);
    const expenditure = filterByRange(buildExpenditureSeries(debug.replay), range, anchorDate);

    const today = todayISO();
    const historicalTargets = reconstructHistoricalTargets(debug.replay);
    const streak = computeLoggedDaysStreak(new Set(dailyTotals.keys()), today);
    const window7 = computeAdherenceForWindow(7, today, dailyTotals, historicalTargets);
    const window30 = computeAdherenceForWindow(30, today, dailyTotals, historicalTargets);

    return { trend, raw, expenditure, streak, window7, window30, weighIns, dailyTotals, rhoMode: debug.rhoMode };
  }, [history, range]);

  if (history.status === 'loading') {
    return <EmptyState title="Loading…" body="Reading your logged history." />;
  }
  if (history.status === 'no-profile') {
    return (
      <EmptyState
        title="No profile yet"
        body="Trends will show up here once your profile is set up and you've logged a first weigh-in."
      />
    );
  }
  if (history.status === 'no-weighins') {
    return (
      <EmptyState
        title="No weigh-ins yet"
        body="Log your first weigh-in to start your weight and expenditure trend."
      />
    );
  }
  if (history.status === 'error') {
    return (
      <EmptyState
        title="Couldn't load trends"
        body={`Something went wrong computing your history: ${history.message}`}
      />
    );
  }
  if (!derived) {
    // Unreachable in practice (status === 'ready' implies derived is non-null), but
    // keeps the render below fully typed without a non-null assertion.
    return null;
  }

  const handleExport = () => {
    const csv = buildHistoryCsv(derived.weighIns, derived.dailyTotals);
    downloadCsv(`trajectory-history-${todayISO()}.csv`, csv);
  };

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg text-ink">History &amp; Trends</h1>
        <button
          type="button"
          onClick={handleExport}
          className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
        >
          Export CSV
        </button>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm text-ink-muted">Weight trend</h2>
        <RangeSelector value={range} onChange={setRange} />
      </div>
      <WeightTrendChart trend={derived.trend} raw={derived.raw} />

      <div>
        <h2 className="mb-2 text-sm text-ink-muted">
          Estimated expenditure
          <span className="ml-2 font-mono text-[11px] tabular-nums text-ink-muted">
            ρ: {derived.rhoMode}
          </span>
        </h2>
        <ExpenditureChart data={derived.expenditure} />
      </div>

      <AdherencePanel streak={derived.streak} window7={derived.window7} window30={derived.window30} />
    </div>
  );
}
