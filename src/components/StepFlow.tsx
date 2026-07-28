// Shared chrome for Onboarding (§9.1) and Check-in (§9.6) — the app's only two
// multi-step flows. Not one of the three components the progress report names for Part 3
// (macro ring / tag chip / ledger row), so collision risk here should be low.
//
// §9.6 is explicit that check-in is "surfaced as non-blocking banner... never a forced
// modal" — that's about the *entry point* (Part 3's Dashboard banner), not this component,
// but in that same spirit this always renders a close affordance so a user is never stuck
// mid-flow with no way out.
import type { ReactNode } from 'react';

export interface StepFlowProps {
  title: string;
  /** 0-based. */
  stepIndex: number;
  stepCount: number;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  onClose?: () => void;
  children: ReactNode;
}

export function StepFlow({
  title,
  stepIndex,
  stepCount,
  onBack,
  onNext,
  nextLabel = 'Next',
  nextDisabled = false,
  onClose,
  children,
}: StepFlowProps) {
  return (
    <div className="flex h-full min-h-[100dvh] flex-col bg-bg text-ink">
      <header className="flex items-center gap-3 px-4 pt-4">
        <div className="flex-1">
          <div className="flex h-1 w-full overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${((stepIndex + 1) / stepCount) * 100}%` }}
            />
          </div>
          <p className="tabular mt-1.5 text-xs text-ink-muted">
            Step {stepIndex + 1} of {stepCount}
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-ink-muted hover:bg-surface-raised hover:text-ink"
          >
            ✕
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-6">
        <h1 className="mb-6 text-xl font-semibold text-ink">{title}</h1>
        {children}
      </div>

      {(onBack || onNext) && (
        <footer className="flex gap-3 border-t border-hairline px-4 py-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl border border-hairline px-5 py-3 text-sm font-medium text-ink-muted hover:text-ink"
            >
              Back
            </button>
          )}
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              disabled={nextDisabled}
              className="flex-1 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-40"
            >
              {nextLabel}
            </button>
          )}
        </footer>
      )}
    </div>
  );
}
