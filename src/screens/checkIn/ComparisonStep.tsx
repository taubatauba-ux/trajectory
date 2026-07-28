import { TargetRing } from '../../components/TargetRing';
import { presentFlags } from '../../engine/flagPresentation';
import type { EngineResponse } from '../../engine/engine.types';
import type { Macros } from '../../types/food';

export type ComparisonStatus = 'idle' | 'submitting' | 'success' | 'error';

export interface ComparisonStepProps {
  status: ComparisonStatus;
  previousTargets?: Macros;
  newResponse?: EngineResponse;
  errorMessage?: string;
  onSubmit: () => void;
  onDone: () => void;
}

const ROWS: { key: keyof Macros; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'proteinG', label: 'Protein', unit: 'g' },
  { key: 'fatG', label: 'Fat', unit: 'g' },
  { key: 'carbG', label: 'Carbs', unit: 'g' },
];

function ComparisonRow({ label, before, after, unit }: { label: string; before?: number; after: number; unit: string }) {
  const delta = before !== undefined ? Math.round(after - before) : undefined;
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-ink">{label}</span>
      <span className="tabular flex items-center gap-1.5 text-sm">
        {before !== undefined && before !== after && (
          <>
            <span className="text-ink-muted line-through">{Math.round(before)}</span>
            <span className="text-ink-muted">→</span>
          </>
        )}
        <span className="font-semibold text-ink">{Math.round(after)}</span>
        <span className="text-ink-muted">{unit}</span>
        {delta !== undefined && delta !== 0 && (
          <span className={delta > 0 ? 'text-accent' : 'text-accent-warn'}>
            ({delta > 0 ? '+' : ''}
            {delta})
          </span>
        )}
      </span>
    </div>
  );
}

export function ComparisonStep({ status, previousTargets, newResponse, errorMessage, onSubmit, onDone }: ComparisonStepProps) {
  if (status === 'submitting') {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="grid grid-cols-2 gap-6">
          <TargetRing label="Calories" loading />
          <TargetRing label="Protein" loading />
          <TargetRing label="Fat" loading />
          <TargetRing label="Carbs" loading />
        </div>
        <p className="text-sm text-ink-muted">Recalculating your targets…</p>
      </div>
    );
  }

  if (status === 'success' && newResponse) {
    const flags = presentFlags(newResponse.flags);
    const unchanged = ROWS.every((r) => previousTargets?.[r.key] === newResponse.targets[r.key]);
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          {unchanged ? 'Your targets are staying the same.' : "Here's what changed:"}
        </p>
        <div className="hairline-divide rounded-xl border border-hairline bg-surface px-3">
          {ROWS.map((r) => (
            <ComparisonRow
              key={r.key}
              label={r.label}
              before={previousTargets?.[r.key]}
              after={newResponse.targets[r.key] ?? 0}
              unit={r.unit}
            />
          ))}
        </div>
        {newResponse.note && <p className="text-sm text-ink-muted">{newResponse.note}</p>}
        {flags.length > 0 && (
          <div className="flex flex-col gap-2">
            {flags.map((f, i) => (
              <p
                key={i}
                className={[
                  'rounded-lg border px-3 py-2 text-xs',
                  f.severity === 'warning'
                    ? 'border-accent-warn/40 text-accent-warn'
                    : 'border-hairline text-ink-muted',
                ].join(' ')}
              >
                {f.label}
              </p>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-bg"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">Ready to recalculate your targets with today's check-in.</p>
      {status === 'error' && (
        <p className="rounded-lg border border-accent-warn/40 px-3 py-2 text-xs text-accent-warn">
          {errorMessage ?? 'Something went wrong. Please try again.'}
        </p>
      )}
      <button
        type="button"
        onClick={onSubmit}
        className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-bg"
      >
        {status === 'error' ? 'Try again' : 'Update my targets'}
      </button>
    </div>
  );
}
