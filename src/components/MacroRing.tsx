import { ratio, roundKcal } from '../lib/macros';

interface MacroRingProps {
  label: string;
  current: number;
  target: number;
  unit?: string;
  size?: number;
  strokeWidth?: number;
}

/**
 * A restrained circular progress ring — kept thin, muted, and numeric-first (tabular
 * mono at the center) rather than a bold gamified "fitness app" progress bar, in
 * keeping with §10's "precision instrument, not a motivational poster" direction. Built
 * for the kcal readout specifically (§9.2's primary number); protein/carb/fat use the
 * lighter-weight MacroBar instead — four full rings would compete for attention rather
 * than establishing one clear hierarchy.
 */
export function MacroRing({ label, current, target, unit = 'kcal', size = 172, strokeWidth = 10 }: MacroRingProps) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = Math.min(1, ratio(current, target));
  const isOver = target > 0 && current > target;
  const dashOffset = circumference * (1 - fraction);
  const center = size / 2;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={center} cy={center} r={r} strokeWidth={strokeWidth} fill="none" className="stroke-surface-raised" />
        <circle
          cx={center}
          cy={center}
          r={r}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className={isOver ? 'stroke-accent-warn' : 'stroke-accent'}
          style={{ transition: 'stroke-dashoffset 300ms ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <span className="font-mono text-[2.1rem] leading-none tabular-nums text-ink">{roundKcal(current)}</span>
        <span className="mt-1.5 font-mono text-xs tabular-nums text-ink-muted">
          / {roundKcal(target)} {unit}
        </span>
        <span className="mt-2 text-[11px] uppercase tracking-wide text-ink-muted">{label}</span>
      </div>
    </div>
  );
}
