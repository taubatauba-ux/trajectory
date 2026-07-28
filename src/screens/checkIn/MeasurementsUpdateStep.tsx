import { FormField } from '../../components/FormField';
import { MEASUREMENT_KEYS } from '../../engine/coldStartPrior';
import type { CheckInState } from './checkInState';

export interface MeasurementsUpdateStepProps {
  state: CheckInState;
  onChange: (patch: Partial<CheckInState>) => void;
  /** The current profile values, for placeholder/hint text — not edited directly. */
  currentValues: Record<string, number>;
}

function labelFor(key: string): string {
  // Same two Engine-recognized keys onboarding suggests (coldStartPrior.ts) get a
  // friendly label; anything else falls back to the raw key since it's whatever the
  // user typed as a custom measurement name originally.
  if (key === MEASUREMENT_KEYS.leanBodyMassKg) return 'Lean body mass (kg)';
  if (key === MEASUREMENT_KEYS.bodyFatPercent) return 'Body fat (%)';
  return key;
}

export function MeasurementsUpdateStep({ state, onChange, currentValues }: MeasurementsUpdateStepProps) {
  const keys = Object.keys(currentValues);

  function updateOne(key: string, value: string) {
    onChange({ measurementUpdates: { ...state.measurementUpdates, [key]: value } });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">Optional — update anything that's changed, or leave as is.</p>
      {keys.map((key) => (
        <FormField
          key={key}
          label={labelFor(key)}
          type="number"
          inputMode="decimal"
          placeholder={String(currentValues[key])}
          value={state.measurementUpdates[key] ?? ''}
          onChange={(e) => updateOne(key, e.target.value)}
        />
      ))}
    </div>
  );
}
