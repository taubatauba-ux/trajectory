// §9.1: "Empty/loading state: skeleton macro rings while the (stubbed, near-instant)
// Engine call resolves." This component covers both that skeleton state and the
// post-load reveal (used by Onboarding's review step). `target` is optional: pass it for
// a genuine progress arc (value as a fraction of target); omit it for a plain "this is
// the number" fully-filled ring, which is what a freshly-computed target — nothing to
// be "in progress" toward yet — calls for.
//
// NOTE for merge: see TagChip.tsx's note on the same topic — Part 3 may also produce a
// version of this; treat as interchangeable.
export interface TargetRingProps {
  label: string;
  /** Omit together with `loading: true` for the skeleton state. */
  value?: number;
  target?: number;
  unit?: string;
  /** Tailwind text-color class controlling the ring's fill, e.g. "text-accent". Defaults
   * to text-accent. */
  colorClassName?: string;
  size?: number;
  loading?: boolean;
}

const STROKE_WIDTH = 6;

export function TargetRing({
  label,
  value,
  target,
  unit,
  colorClassName = 'text-accent',
  size = 88,
  loading = false,
}: TargetRingProps) {
  const radius = (size - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = loading || value === undefined ? 0 : target ? Math.min(1, value / target) : 1;
  const dashoffset = circumference * (1 - fraction);

  return (
    <div className="flex flex-col items-center gap-2" aria-live={loading ? undefined : 'polite'}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={STROKE_WIDTH}
            className="text-hairline"
            stroke="currentColor"
          />
          {!loading && value !== undefined && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              stroke="currentColor"
              className={colorClassName}
              strokeDasharray={circumference}
              strokeDashoffset={dashoffset}
            />
          )}
          {loading && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              stroke="currentColor"
              className="motion-safe:animate-pulse text-ink-muted/40"
              strokeDasharray={`${circumference * 0.22} ${circumference}`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {loading || value === undefined ? (
            <span className="motion-safe:animate-pulse text-ink-muted">{'\u2014'}</span>
          ) : (
            <>
              <span className="tabular text-lg font-semibold text-ink">{Math.round(value)}</span>
              {unit && <span className="text-[10px] uppercase tracking-wide text-ink-muted">{unit}</span>}
            </>
          )}
        </div>
      </div>
      <span className="text-xs text-ink-muted">{label}</span>
    </div>
  );
}
