export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  label?: string;
  options: SegmentedControlOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-sm text-ink-muted">{label}</span>}
      <div role="radiogroup" aria-label={label} className="flex gap-2">
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(opt.value)}
              className={[
                'flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors',
                selected
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-hairline bg-surface text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
