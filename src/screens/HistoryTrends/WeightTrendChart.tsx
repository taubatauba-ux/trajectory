import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Scatter,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { formatDisplayDate } from '../_shared/dates';
import { axisTickStyle, axisLineColor, gridColor, tooltipContentStyle, tooltipLabelStyle, series } from '../_shared/chartTheme';
import type { WeightTrendPoint, RawWeighInPoint } from './chartData';

interface OutlierDotProps {
  cx?: number;
  cy?: number;
  payload?: RawWeighInPoint;
}

/** Recharts custom point renderer for the raw-weigh-in Scatter — a filled dot, larger
 * and accent-warn colored for a day Module D flagged as a possible outlier (§6), so an
 * unusual reading is visually legible without a separate legend entry to explain it. */
function RawWeighInDot({ cx, cy, payload }: OutlierDotProps) {
  if (cx === undefined || cy === undefined || !payload) return null;
  const isOutlier = payload.isOutlier;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={isOutlier ? 4.5 : 3}
      fill={isOutlier ? series.outlier : series.weightRaw}
      stroke={isOutlier ? series.outlier : 'none'}
      strokeWidth={isOutlier ? 1.5 : 0}
      strokeOpacity={0.35}
    />
  );
}

interface WeightTrendChartProps {
  trend: WeightTrendPoint[];
  raw: RawWeighInPoint[];
  height?: number;
}

export function WeightTrendChart({ trend, raw, height = 220 }: WeightTrendChartProps) {
  const hasOutliers = raw.some((p) => p.isOutlier);

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke={gridColor} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={axisTickStyle}
            axisLine={{ stroke: axisLineColor }}
            tickLine={false}
            tickFormatter={(d: string) => formatDisplayDate(d)}
            minTickGap={28}
          />
          <YAxis
            tick={axisTickStyle}
            axisLine={false}
            tickLine={false}
            domain={['dataMin - 1', 'dataMax + 1']}
            width={40}
            tickFormatter={(v: number) => `${v}`}
          />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            labelFormatter={(d: string) => formatDisplayDate(d, true)}
            formatter={(value: number, name: string) => [
              `${value} kg`,
              name === 'trendWeightKg' ? 'Trend' : 'Weigh-in',
            ]}
          />
          <Line
            type="monotone"
            dataKey="trendWeightKg"
            stroke={series.weightTrend}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Scatter data={raw} dataKey="rawWeightKg" shape={<RawWeighInDot />} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      {hasOutliers && (
        <p className="mt-2 text-xs text-ink-muted">
          <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: series.outlier }} />
          <span className="ml-1.5 align-middle">
            Marked points were an unusually large day-to-day change, flagged as possibly not a
            real shift — the trend line underneath doesn&apos;t jump with them.
          </span>
        </p>
      )}
    </div>
  );
}
