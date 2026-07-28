import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

export interface FormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Right-aligned suffix inside the input row, e.g. "cm" / "kg". */
  suffix?: string;
}

/** Numeric inputs render in the app's tabular-mono style (§10: "every quantity in the
 * app"), since these are almost always kg/cm/kcal values. */
export function FormField({ label, hint, error, suffix, id, type, ...inputProps }: FormFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const isNumeric = type === 'number';
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm text-ink-muted">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-hairline bg-surface px-3 py-2.5 focus-within:border-accent">
        <input
          id={fieldId}
          type={type}
          className={[
            'w-full min-w-0 bg-transparent text-ink placeholder:text-ink-muted focus:outline-none',
            isNumeric ? 'tabular' : '',
          ].join(' ')}
          {...inputProps}
        />
        {suffix && <span className="tabular shrink-0 text-sm text-ink-muted">{suffix}</span>}
      </div>
      {error ? (
        <p className="text-xs text-accent-warn">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}
