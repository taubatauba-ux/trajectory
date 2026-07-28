import { FormField } from '../../components/FormField';
import { SegmentedControl } from '../../components/SegmentedControl';
import type { OnboardingState } from './onboardingState';

export interface GoalStepProps {
  state: OnboardingState;
  onChange: (patch: Partial<OnboardingState>) => void;
}

// Each phrase is written to read naturally *and* land unambiguously in its intended
// bucket under engine/coldStartPrior.ts's inferActivityLevel() keyword matching (checked
// in order extra -> very -> sedentary -> moderate -> light -> default moderate) — verified
// against that exact keyword list and priority order while building this screen. Tapping
// a chip replaces the free-text field with its phrase; the field stays editable
// afterward, so this is a starting point, not a locked choice.
const ACTIVITY_CHIPS = [
  { label: 'Sedentary', phrase: 'Sedentary — mostly a desk job, little to no regular exercise.' },
  {
    label: 'Lightly active',
    phrase: 'Lightly active — occasional walks or light activity, about 1-2 days a week.',
  },
  { label: 'Moderately active', phrase: 'Moderately active — I exercise about 3-5 days a week.' },
  { label: 'Very active', phrase: 'Very active — I train every day.' },
  { label: 'Extremely active', phrase: 'Extremely active — physical job with manual labor.' },
] as const;

export function GoalStep({ state, onChange }: GoalStepProps) {
  return (
    <div className="flex flex-col gap-5">
      <SegmentedControl
        label="Goal"
        value={state.goalType}
        onChange={(goalType) => onChange({ goalType })}
        options={[
          { value: 'cut', label: 'Cut' },
          { value: 'maintain', label: 'Maintain' },
          { value: 'bulk', label: 'Bulk' },
        ]}
      />

      {state.goalType !== 'maintain' && (
        <FormField
          label="Target weight (optional)"
          type="number"
          inputMode="decimal"
          placeholder="65"
          suffix="kg"
          value={state.targetWeightKg}
          onChange={(e) => onChange({ targetWeightKg: e.target.value })}
        />
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm text-ink-muted">Activity level</span>
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_CHIPS.map((chip) => {
            const selected = state.activityNote === chip.phrase;
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => onChange({ activityNote: chip.phrase })}
                className={[
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  selected
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-hairline text-ink-muted hover:text-ink',
                ].join(' ')}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
        <textarea
          value={state.activityNote}
          onChange={(e) => onChange({ activityNote: e.target.value })}
          placeholder="Or describe it in your own words — e.g. how often you exercise, what your job involves."
          rows={3}
          className="w-full rounded-xl border border-hairline bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
        />
        <p className="text-xs text-ink-muted">
          Free text is fine — pick a chip to start, then edit it however you like.
        </p>
      </div>
    </div>
  );
}
