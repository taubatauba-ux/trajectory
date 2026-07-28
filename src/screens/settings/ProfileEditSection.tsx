import { FormField } from '../../components/FormField';
import { SegmentedControl } from '../../components/SegmentedControl';
import { DetailRow } from '../../components/DetailRow';
import { newId } from '../../data/id';
import { cmToIn, inToCm, kgToLb, lbToKg } from '../../lib/units';
import {
  slugifyMeasurementKey,
  suggestedMeasurementDefs,
  type MeasurementRow,
  type SettingsFormState,
} from './settingsState';

export interface ProfileEditSectionProps {
  state: SettingsFormState;
  onChange: (patch: Partial<SettingsFormState>) => void;
}

/** §9.12: "Profile edit (all of §4.1)". One scrollable form rather than Onboarding's
 * step wizard — there's no "next" to gate here, everything is visible and editable at
 * once, and StepFlow's chrome (progress dots, a single forward direction) doesn't fit a
 * screen you dip in and out of to tweak one field. The field-level components
 * (FormField, SegmentedControl, DetailRow) and the measurement-row editing pattern are
 * shared with Onboarding's AboutYouStep/GoalStep/BodyCompositionStep — same fields,
 * same interaction, so it should feel like the same form, not a reimplementation of it. */
export function ProfileEditSection({ state, onChange }: ProfileEditSectionProps) {
  const imperial = state.unitPreference === 'imperial';

  // state.heightCm/targetWeightKg stay canonical cm/kg strings always (so
  // settingsStateToProfilePatch never needs to know which unit was active when they
  // were typed) — these two pairs are the display/input boundary where the toggle
  // actually takes effect, converting only for what's shown and re-converting
  // immediately on input back to the canonical value that gets stored.
  function displayHeight(cmStr: string): string {
    const cm = Number(cmStr);
    if (!Number.isFinite(cm) || cmStr.trim() === '') return cmStr;
    return imperial ? String(Math.round(cmToIn(cm) * 10) / 10) : cmStr;
  }
  function parseHeightInput(typed: string): string {
    const n = Number(typed);
    if (!Number.isFinite(n) || typed.trim() === '') return typed;
    return imperial ? String(Math.round(inToCm(n) * 10) / 10) : typed;
  }
  function displayWeight(kgStr: string): string {
    const kg = Number(kgStr);
    if (!Number.isFinite(kg) || kgStr.trim() === '') return kgStr;
    return imperial ? String(Math.round(kgToLb(kg))) : kgStr;
  }
  function parseWeightFieldInput(typed: string): string {
    const n = Number(typed);
    if (!Number.isFinite(n) || typed.trim() === '') return typed;
    return imperial ? String(Math.round(lbToKg(n) * 10) / 10) : typed;
  }

  function updateRow(id: string, patch: Partial<MeasurementRow>) {
    onChange({ measurements: state.measurements.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  }

  function removeRow(id: string) {
    onChange({ measurements: state.measurements.filter((m) => m.id !== id) });
  }

  function addSuggestedRow(def: { key: string; label: string; unit: string }) {
    if (state.measurements.some((m) => m.key === def.key)) return;
    onChange({
      measurements: [
        ...state.measurements,
        { id: newId(), key: def.key, label: def.label, value: '', suggested: true, unit: def.unit },
      ],
    });
  }

  function addCustomRow() {
    onChange({ measurements: [...state.measurements, { id: newId(), key: '', label: '', value: '', suggested: false }] });
  }

  const suggestedDefs = suggestedMeasurementDefs();
  const addedKeys = new Set(state.measurements.map((m) => m.key));

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-medium text-ink">Profile</h2>

        <SegmentedControl
          label="Units"
          value={state.unitPreference}
          onChange={(unitPreference) => onChange({ unitPreference })}
          options={[
            { value: 'metric', label: 'Metric (kg, cm)' },
            { value: 'imperial', label: 'Imperial (lb, ft/in)' },
          ]}
        />
        <p className="-mt-3 text-xs text-ink-muted">
          Everything stays stored in kg/cm either way — this only changes what you see and
          type. Currently applied to this screen and the Dashboard's weigh-in; other
          screens are still metric-only for now.
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
          suffix={imperial ? 'in' : 'cm'}
          value={displayHeight(state.heightCm)}
          onChange={(e) => onChange({ heightCm: parseHeightInput(e.target.value) })}
        />
      </section>

      <section className="flex flex-col gap-5 border-t border-hairline pt-6">
        <h2 className="text-sm font-medium text-ink">Goal</h2>

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
            suffix={imperial ? 'lb' : 'kg'}
            value={displayWeight(state.targetWeightKg)}
            onChange={(e) => onChange({ targetWeightKg: parseWeightFieldInput(e.target.value) })}
          />
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="activity-note" className="text-sm text-ink-muted">
            Activity level
          </label>
          <textarea
            id="activity-note"
            value={state.activityNote}
            onChange={(e) => onChange({ activityNote: e.target.value })}
            rows={3}
            className="w-full rounded-xl border border-hairline bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3 border-t border-hairline pt-6">
        <h2 className="text-sm font-medium text-ink">Body composition</h2>
        <p className="text-xs text-ink-muted">
          Sharper inputs give the engine a better estimate — optional either way.
        </p>

        <div className="flex flex-wrap gap-2">
          {suggestedDefs
            .filter((def) => !addedKeys.has(def.key))
            .map((def) => (
              <button
                key={def.key}
                type="button"
                onClick={() => addSuggestedRow(def)}
                className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
              >
                + {def.label}
              </button>
            ))}
          <button
            type="button"
            onClick={addCustomRow}
            className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
          >
            + Custom measurement
          </button>
        </div>

        {state.measurements.length > 0 && (
          <div className="hairline-divide rounded-xl border border-hairline bg-surface px-3">
            {state.measurements.map((row) => (
              <DetailRow
                key={row.id}
                label={
                  row.suggested ? (
                    row.label
                  ) : (
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) =>
                        updateRow(row.id, { label: e.target.value, key: slugifyMeasurementKey(e.target.value) })
                      }
                      placeholder="Measurement name"
                      className="w-full bg-transparent text-sm text-ink placeholder:text-ink-muted focus:outline-none"
                    />
                  )
                }
                value={
                  <span className="flex items-center gap-1.5">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={row.value}
                      onChange={(e) => updateRow(row.id, { value: e.target.value })}
                      placeholder="0"
                      className="tabular w-16 bg-transparent text-right text-sm text-ink placeholder:text-ink-muted focus:outline-none"
                    />
                    {row.unit && <span className="text-xs text-ink-muted">{row.unit}</span>}
                  </span>
                }
                trailing={
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    aria-label={`Remove ${row.label || 'measurement'}`}
                    className="px-1 text-ink-muted hover:text-accent-warn"
                  >
                    ✕
                  </button>
                }
              />
            ))}
          </div>
        )}
      </section>

      {state.sex === 'female' && (
        <section className="flex flex-col gap-1.5 border-t border-hairline pt-6">
          <SegmentedControl
            label="Currently pregnant or breastfeeding?"
            value={state.pregnancyOrBreastfeedingStatus ?? null}
            onChange={(pregnancyOrBreastfeedingStatus) => onChange({ pregnancyOrBreastfeedingStatus })}
            options={[
              { value: 'not_applicable', label: 'No' },
              { value: 'pregnant', label: 'Pregnant' },
              { value: 'breastfeeding', label: 'Breastfeeding' },
            ]}
          />
          <p className="text-xs text-ink-muted">This affects safe calorie targets.</p>
        </section>
      )}

      <section className="flex flex-col gap-1.5 border-t border-hairline pt-6">
        <SegmentedControl
          label="Currently using a GLP-1 or similar appetite-affecting medication?"
          value={state.pharmacologicallyAssisted ? 'yes' : 'no'}
          onChange={(v) => onChange({ pharmacologicallyAssisted: v === 'yes' })}
          options={[
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes' },
          ]}
        />
        <p className="text-xs text-ink-muted">
          Widens the engine's expected noise range and treats a sustained appetite shift
          as the new normal rather than a transient to wait out — see the flag this adds
          on the Dashboard for the full explanation.
        </p>
      </section>
    </div>
  );
}
