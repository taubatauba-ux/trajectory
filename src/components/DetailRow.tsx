// §10 signature element: "hairline row dividers under every list item... rather than
// card shadows or heavy borders." The divider itself is `.hairline-divide` (already in
// index.css, Part 1) — applied to the *list container*, not each row, so a plain <ul
// className="hairline-divide"> of these composes correctly without every row needing to
// know it's "not the first." This component is just one row's content/layout.
//
// NOTE for merge: see TagChip.tsx's note — Part 3 may also produce this exact file;
// treat as interchangeable.
import type { ReactNode } from 'react';

export interface DetailRowProps {
  label: ReactNode;
  /** Usually a tabular-mono numeric string, e.g. "142 kcal" — this component doesn't
   * force the `tabular` class since some values (a food name, an ingredient's name) are
   * legitimately not numeric; apply `tabular` at the call site when it is. */
  value: ReactNode;
  sublabel?: ReactNode;
  /** e.g. a remove/expand button. Rendered after value, doesn't participate in onClick. */
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function DetailRow({ label, value, sublabel, trailing, onClick, className }: DetailRowProps) {
  const content = (
    <>
      <span className="flex min-w-0 flex-col items-start text-left">
        <span className="truncate text-sm text-ink">{label}</span>
        {sublabel !== undefined && <span className="truncate text-xs text-ink-muted">{sublabel}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-sm text-ink">{value}</span>
        {trailing}
      </span>
    </>
  );

  const rowClass = ['flex items-center justify-between gap-3 py-3', className ?? ''].join(' ');

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={[rowClass, 'w-full text-left'].join(' ')}>
        {content}
      </button>
    );
  }
  return <div className={rowClass}>{content}</div>;
}
