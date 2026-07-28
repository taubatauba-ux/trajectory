import { DetailRow } from '../../components/DetailRow';
import { SegmentedControl } from '../../components/SegmentedControl';
import { newId } from '../../data/id';
import {
  slugifyMeasurementKey,
  suggestedMeasurementDefs,
  type MeasurementRow,
  type OnboardingState,
} from './onboardingState';

export interface BodyCompositionStepProps {
  state: OnboardingState;
  onChange: (patch: Partial<OnboardingState>) => void;
}

export function BodyCompositionStep({ state, onChange }: BodyCompositionStepProps) {
  function updateRow(id: string, patch: Partial<MeasurementRow>) {
    onChange({ measurements: state.measurements.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  }

  function removeRow(id: string) {
    onChange({ measurements: state.measurements.filter((m) => m.id !== id) });
  }

  function addSuggestedRow(def: { key: string; label: string; unit: string }) {
    if (state.measurements.some((m) => m.key === def.key)) return;
    const row: MeasurementRow = { id: newId(), key: def.key, label: def.label, value: '', suggested: true, unit: def.unit };
    onChange({ measurements: [...state.measurements, row] });
  }

  function addCustomRow() {
    const row: MeasurementRow = { id: newId(), key: '', label: '', value: '', suggested: false };
    onChange({ measurements: [...state.measurements, row] });
  }

  const suggestedDefs = suggestedMeasurementDefs();
  const addedKeys = new Set(state.measurements.map((m) => m.key));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">
          Optional — sharper body-composition data gives the engine a better starting
          estimate. Skip this and add it anytime later.
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
      </div>

      {state.sex === 'female' && (
        <div className="flex flex-col gap-1.5">
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
          <p className="text-xs text-ink-muted">
            This affects safe calorie targets. Skip it if you’d rather not answer —
            targets will stay conservative either way.
          </p>
        </div>
      )}
    </div>
  );
}
