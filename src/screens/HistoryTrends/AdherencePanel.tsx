import type { AdherenceWindowSummary } from './adherence';

interface AdherencePanelProps {
  streak: number;
  window7: AdherenceWindowSummary;
  window30: AdherenceWindowSummary;
}

function AccuracyRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-mono text-[13px] tabular-nums text-ink">
        {value === null ? '—' : `${value}%`}
      </span>
      <span className="text-[11px] text-ink-muted">{label}</span>
    </div>
  );
}

function WindowSummary({ title, summary }: { title: string; summary: AdherenceWindowSummary }) {
  return (
    <div className="border-t border-hairline pt-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm text-ink">{title}</h3>
        <span className="font-mono text-xs tabular-nums text-ink-muted">
          logged {summary.loggedDaysInWindow}/{summary.windowDays}d
        </span>
      </div>
      {summary.avgAccuracy ? (
        <div className="grid grid-cols-4 gap-2">
          <AccuracyRow label="kcal" value={summary.avgAccuracy.kcal} />
          <AccuracyRow label="protein" value={summary.avgAccuracy.proteinG} />
          <AccuracyRow label="carb" value={summary.avgAccuracy.carbG} />
          <AccuracyRow label="fat" value={summary.avgAccuracy.fatG} />
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Nothing logged in this window yet.</p>
      )}
    </div>
  );
}

export function AdherencePanel({ streak, window7, window30 }: AdherencePanelProps) {
  return (
    <div className="rounded-lg bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm text-ink-muted">Logged-days streak</h2>
        <span className="font-mono text-2xl tabular-nums text-ink">
          {streak}
          <span className="ml-1 text-sm text-ink-muted">{streak === 1 ? 'day' : 'days'}</span>
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <WindowSummary title="Accuracy, last 7 days" summary={window7} />
        <WindowSummary title="Accuracy, last 30 days" summary={window30} />
      </div>

      <p className="mt-3 border-t border-hairline pt-3 text-xs text-ink-muted">
        Accuracy compares what you logged to that day&apos;s target, reconstructed from the
        Engine&apos;s own history — 100% is an exact match, and over- or under-shooting are scored
        the same. Days you didn&apos;t log aren&apos;t counted against accuracy, only against the count
        above.
      </p>
    </div>
  );
}
