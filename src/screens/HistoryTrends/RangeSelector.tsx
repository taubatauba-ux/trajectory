import type { ChartRange } from './chartData';

const OPTIONS: { value: ChartRange; label: string }[] = [
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 180, label: '180d' },
  { value: 'all', label: 'All' },
];

interface RangeSelectorProps {
  value: ChartRange;
  onChange: (range: ChartRange) => void;
}

export function RangeSelector({ value, onChange }: RangeSelectorProps) {
  return (
    <div className="inline-flex rounded-md border border-hairline p-0.5" role="group" aria-label="Chart time range">
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`rounded px-2.5 py-1 font-mono text-xs tabular-nums transition-colors ${
              active ? 'bg-surface-raised text-ink' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
