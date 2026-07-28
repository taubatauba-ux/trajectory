import { useState } from 'react';
import type { PeriodEntry, PeriodFlow } from '../../types';
import { formatDisplayDate } from '../_shared/dates';
import type { DayEntryInput } from './usePeriodEntries';
import { colors } from '../../design/tokens';
import { hexToRgba } from '../_shared/color';

const FLOW_OPTIONS: { value: PeriodFlow; label: string }[] = [
  { value: 'spotting', label: 'Spotting' },
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'heavy', label: 'Heavy' },
];

const SYMPTOM_PRESETS = [
  'Cramps', 'Headache', 'Bloating', 'Fatigue', 'Mood swings', 'Tender breasts', 'Acne', 'Backache', 'Nausea',
];

interface DayEntrySheetProps {
  date: string;
  existing: PeriodEntry | undefined;
  onSave: (input: DayEntryInput) => void;
  onClose: () => void;
}

export function DayEntrySheet({ date, existing, onSave, onClose }: DayEntrySheetProps) {
  const [flow, setFlow] = useState<PeriodFlow | undefined>(existing?.flow);
  const [symptoms, setSymptoms] = useState<string[]>(existing?.symptoms ?? []);

  const toggleSymptom = (s: string) => {
    setSymptoms((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm text-ink">{formatDisplayDate(date, true)}</h3>
        <button type="button" onClick={onClose} className="text-xs text-ink-muted hover:text-ink">
          Close
        </button>
      </div>

      <div>
        <span className="mb-1.5 block text-xs text-ink-muted">Flow</span>
        <div className="flex flex-wrap gap-1.5">
          {FLOW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFlow(flow === opt.value ? undefined : opt.value)}
              aria-pressed={flow === opt.value}
              style={flow === opt.value ? { backgroundColor: hexToRgba(colors.accentWarn, 0.15) } : undefined}
              className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                flow === opt.value ? 'border-accent-warn text-ink' : 'border-hairline text-ink-muted hover:border-ink-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-1.5 block text-xs text-ink-muted">Symptoms</span>
        <div className="flex flex-wrap gap-1.5">
          {SYMPTOM_PRESETS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSymptom(s)}
              aria-pressed={symptoms.includes(s)}
              style={symptoms.includes(s) ? { backgroundColor: hexToRgba(colors.tagOff, 0.15) } : undefined}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                symptoms.includes(s) ? 'border-tag-off text-ink' : 'border-hairline text-ink-muted hover:border-ink-muted'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            onSave({});
            onClose();
          }}
          className="rounded-md px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
        >
          Clear day
        </button>
        <button
          type="button"
          onClick={() => {
            onSave({ flow, symptoms: symptoms.length > 0 ? symptoms : undefined });
            onClose();
          }}
          className="rounded-md bg-accent px-3 py-1.5 text-xs text-bg"
        >
          Save
        </button>
      </div>
    </div>
  );
}
