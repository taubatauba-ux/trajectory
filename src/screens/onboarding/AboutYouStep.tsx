import { FormField } from '../../components/FormField';
import { SegmentedControl } from '../../components/SegmentedControl';
import type { OnboardingState } from './onboardingState';

export interface AboutYouStepProps {
  state: OnboardingState;
  onChange: (patch: Partial<OnboardingState>) => void;
}

export function AboutYouStep({ state, onChange }: AboutYouStepProps) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-muted">
        A few basics the engine needs to estimate your starting point. You can refine
        everything later.
      </p>

      <SegmentedControl
        label="Sex"
        value={state.sex}
        onChange={(sex) => onChange({ sex })}
        options={[
          { value: 'female', label: 'Female' },
          { value: 'male', label: 'Male' },
        ]}
      />

      <FormField
        label="Date of birth"
        type="date"
        value={state.dateOfBirth}
        max={new Date().toISOString().slice(0, 10)}
        onChange={(e) => onChange({ dateOfBirth: e.target.value })}
      />

      <FormField
        label="Height"
        type="number"
        inputMode="decimal"
        placeholder="170"
        suffix="cm"
        value={state.heightCm}
        onChange={(e) => onChange({ heightCm: e.target.value })}
      />

      <FormField
        label="Current weight"
        type="number"
        inputMode="decimal"
        placeholder="70"
        suffix="kg"
        value={state.currentWeightKg}
        onChange={(e) => onChange({ currentWeightKg: e.target.value })}
        hint="Today's weight — this becomes your first weigh-in."
      />
    </div>
  );
}
