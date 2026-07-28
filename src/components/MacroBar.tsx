import { ratio, roundGrams } from '../lib/macros';
import { cx } from '../lib/cx';

interface MacroBarProps {
  label: string;
  current: number;
  target: number;
  unit?: string;
}

export function MacroBar({ label, current, target, unit = 'g' }: MacroBarProps) {
  const fraction = Math.min(1, ratio(current, target));
  const isOver = target > 0 && current > target;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-ink-muted">{label}</span>
        <span className="font-mono text-xs tabular-nums text-ink">
          {roundGrams(current)}
          <span className="text-ink-muted">/{roundGrams(target)}{unit}</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
        <div
          className={cx('h-full rounded-full', isOver ? 'bg-accent-warn' : 'bg-accent')}
          style={{ width: `${fraction * 100}%`, transition: 'width 300ms ease-out' }}
        />
      </div>
    </div>
  );
}
