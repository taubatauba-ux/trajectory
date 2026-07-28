// Recharts styling constants for Part 5's charts (History & Trends' weight/expenditure
// charts). Built ON TOP OF src/design/tokens.ts (imported, not duplicated) — that file's
// own comment calls out exactly this use case ("an SVG chart fill in History & Trends,
// §9.8"). Kept here rather than inline in each chart component so the two charts
// (WeightTrendChart, ExpenditureChart) read from one consistent palette instead of two
// hand-picked ones.
import { colors, fonts } from '../../design/tokens';

/** Recharts' <XAxis>/<YAxis> `tick` prop accepts an object of SVG text attributes. Every
 * quantity in this app renders tabular-mono per §10 — chart axis numbers are quantities. */
export const axisTickStyle = {
  fontFamily: fonts.mono,
  fontSize: 11,
  fill: colors.inkMuted,
} as const;

export const axisLineColor = colors.hairline;
export const gridColor = colors.hairline;

/** Recharts' <Tooltip contentStyle/labelStyle/itemStyle> — styled as a small ledger
 * card, consistent with §10's "hairline dividers, not card shadows" direction, so the
 * one place this app does use a bordered box at least keeps the border hairline-thin. */
export const tooltipContentStyle = {
  background: colors.surfaceRaised,
  border: `1px solid ${colors.hairline}`,
  borderRadius: 6,
  fontFamily: fonts.mono,
  fontSize: 12,
  color: colors.ink,
  padding: '8px 10px',
} as const;

export const tooltipLabelStyle = {
  color: colors.inkMuted,
  fontFamily: fonts.sans,
  fontSize: 11,
  marginBottom: 4,
} as const;

/** Series colors. Reuses the existing semantic tokens rather than inventing new ones —
 * `accent` already means "on-track/primary" and `accentWarn` already means
 * "needs-attention", both of which map cleanly onto trend-vs-raw and outlier framing. */
export const series = {
  /** Kalman-filtered trend line — the Engine's actual output, so it gets the primary color. */
  weightTrend: colors.accent,
  /** Raw logged weigh-ins — de-emphasized relative to the trend line; muted ink, not a
   * second accent color, since it's supporting context rather than the headline series. */
  weightRaw: colors.inkMuted,
  /** A weigh-in Module D flagged (§6) — accent-warn, matching its "needs attention" use
   * elsewhere (over-target states), not a claim that the reading itself was wrong. */
  outlier: colors.accentWarn,
  tdeeLine: colors.accent,
  /** The ±SD(TDEE) band — same hue as the line, low alpha, so it reads as "uncertainty
   * around this line" rather than a second independent series. */
  tdeeBand: 'rgba(78, 156, 137, 0.16)',
  target: colors.tagOff,
} as const;

export const chartMargin = { top: 8, right: 12, bottom: 4, left: 0 } as const;
