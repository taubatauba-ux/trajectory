import { FormField } from '../../components/FormField';
import type { CheckInState } from './checkInState';

export interface WeighInStepProps {
  state: CheckInState;
  onChange: (patch: Partial<CheckInState>) => void;
  lastWeighInDate?: string;
}

export function WeighInStep({ state, onChange, lastWeighInDate }: WeighInStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        {lastWeighInDate
          ? `Pre-filled from your last weigh-in (${lastWeighInDate}) — adjust if today's is different.`
          : "What's today's weight?"}
      </p>
      <FormField
        label="Today's weight"
        type="number"
        inputMode="decimal"
        suffix="kg"
        value={state.weightKg}
        onChange={(e) => onChange({ weightKg: e.target.value })}
      />
    </div>
  );
}
