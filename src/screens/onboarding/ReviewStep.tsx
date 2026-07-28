import { DetailRow } from '../../components/DetailRow';
import { TargetRing } from '../../components/TargetRing';
import type { EngineResponse } from '../../engine/engine.types';
import { presentFlags } from '../../engine/flagPresentation';
import type { OnboardingState } from './onboardingState';

export type ReviewStatus = 'idle' | 'submitting' | 'success' | 'error';

export interface ReviewStepProps {
  state: OnboardingState;
  status: ReviewStatus;
  engineResponse?: EngineResponse;
  errorMessage?: string;
  onSubmit: () => void;
  onContinue: () => void;
}

function ageFromDob(dob: string): number {
  const diff = Date.now() - new Date(dob).getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}

export function ReviewStep({ state, status, engineResponse, errorMessage, onSubmit, onContinue }: ReviewStepProps) {
  if (status === 'submitting') {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="grid grid-cols-2 gap-6">
          <TargetRing label="Calories" loading />
          <TargetRing label="Protein" loading />
          <TargetRing label="Fat" loading />
          <TargetRing label="Carbs" loading />
        </div>
        <p className="text-sm text-ink-muted">Calculating your starting targets…</p>
      </div>
    );
  }

  if (status === 'success' && engineResponse) {
    const flags = presentFlags(engineResponse.flags);
    return (
      <div className="flex flex-col items-center gap-6 py-4">
        <p className="text-sm text-ink-muted">Here's where we're starting you off:</p>
        <div className="grid grid-cols-2 gap-6">
          <TargetRing label="Calories" value={engineResponse.targets.kcal} unit="kcal" colorClassName="text-accent" />
          <TargetRing label="Protein" value={engineResponse.targets.proteinG} unit="g" colorClassName="text-tag-icmr" />
          <TargetRing label="Fat" value={engineResponse.targets.fatG} unit="g" colorClassName="text-tag-off" />
          <TargetRing label="Carbs" value={engineResponse.targets.carbG} unit="g" colorClassName="text-tag-custom" />
        </div>
        {engineResponse.note && <p className="text-center text-sm text-ink-muted">{engineResponse.note}</p>}
        {flags.length > 0 && (
          <div className="flex w-full flex-col gap-2">
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
          onClick={onContinue}
          className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-bg"
        >
          Go to my dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">Double-check everything, then let's calculate your targets.</p>

      <div className="hairline-divide rounded-xl border border-hairline bg-surface px-3">
        <DetailRow label="Sex" value={state.sex === 'female' ? 'Female' : 'Male'} />
        <DetailRow label="Age" value={<span className="tabular">{ageFromDob(state.dateOfBirth)}</span>} />
        <DetailRow label="Height" value={<span className="tabular">{state.heightCm} cm</span>} />
        <DetailRow label="Current weight" value={<span className="tabular">{state.currentWeightKg} kg</span>} />
        <DetailRow
          label="Goal"
          value={state.goalType[0]!.toUpperCase() + state.goalType.slice(1)}
          sublabel={state.targetWeightKg ? `Target: ${state.targetWeightKg} kg` : undefined}
        />
        <DetailRow
          label="Activity"
          value={state.activityNote ? 'Set' : 'Not set'}
          sublabel={state.activityNote || undefined}
        />
        {state.measurements
          .filter((m) => m.key && m.value)
          .map((m) => (
            <DetailRow key={m.id} label={m.label} value={<span className="tabular">{m.value}{m.unit ?? ''}</span>} />
          ))}
        {state.pregnancyOrBreastfeedingStatus && (
          <DetailRow
            label="Pregnant / breastfeeding"
            value={state.pregnancyOrBreastfeedingStatus === 'not_applicable' ? 'No' : 'Yes'}
          />
        )}
      </div>

      {status === 'error' && (
        <p className="rounded-lg border border-accent-warn/40 px-3 py-2 text-xs text-accent-warn">
          {errorMessage ?? 'Something went wrong saving your profile. Please try again.'}
        </p>
      )}

      <button
        type="button"
        onClick={onSubmit}
        className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-bg"
      >
        {status === 'error' ? 'Try again' : 'Confirm & get my targets'}
      </button>
    </div>
  );
}
