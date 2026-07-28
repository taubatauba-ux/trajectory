import { useEffect, useState } from 'react';
import { ScaleIcon, CheckIcon } from '../../components/icons';
import { cx } from '../../lib/cx';
import { toDisplayWeightValue, parseWeightInput, weightUnitLabel, type UnitPreference } from '../../lib/units';

interface QuickWeighInProps {
  /** Today's already-saved weight, if any — undefined means not yet weighed in today.
   * Always kg (canonical, §4) regardless of display unit. */
  existingWeightKg: number | undefined;
  /** Always receives kg — this component is the one place the display-unit conversion
   * happens; every caller and every stored value stays in kg. */
  onSave: (weightKg: number) => void;
  unitPreference: UnitPreference;
}

export function QuickWeighIn({ existingWeightKg, onSave, unitPreference }: QuickWeighInProps) {
  const displayExisting =
    existingWeightKg !== undefined ? String(toDisplayWeightValue(existingWeightKg, unitPreference)) : '';
  const [value, setValue] = useState(displayExisting);
  const [dirty, setDirty] = useState(false);

  // Keep the field in sync if the underlying data changes from elsewhere (e.g. Dexie's
  // live query re-resolves after a save) — but only while the user isn't mid-edit.
  useEffect(() => {
    if (!dirty) setValue(displayExisting);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingWeightKg, unitPreference, dirty]);

  const saved = !dirty && existingWeightKg !== undefined;
  const parsedDisplay = Number(value);
  const canSave = value.trim() !== '' && Number.isFinite(parsedDisplay) && parsedDisplay > 0;
  const unitLabel = weightUnitLabel(unitPreference);

  function handleSave() {
    if (!canSave) return;
    onSave(parseWeightInput(parsedDisplay, unitPreference));
    setDirty(false);
  }

  return (
    <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
      <ScaleIcon size={18} className="shrink-0 text-ink-muted" />
      <span className="text-sm text-ink-muted">Weight today</span>
      <div className="ml-auto flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setDirty(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
          }}
          placeholder="—"
          aria-label={`Weight in ${unitLabel === 'kg' ? 'kilograms' : 'pounds'}`}
          className="w-16 rounded border border-hairline bg-surface px-2 py-1 text-right font-mono text-sm tabular-nums text-ink outline-none"
        />
        <span className="text-xs text-ink-muted">{unitLabel}</span>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saved}
          aria-label="Save weight"
          className={cx(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
            saved ? 'text-accent' : 'bg-accent text-bg disabled:opacity-40',
          )}
        >
          <CheckIcon size={14} />
        </button>
      </div>
    </div>
  );
}
