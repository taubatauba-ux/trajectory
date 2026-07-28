import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { formatDisplayDate } from '../_shared/dates';
import { axisTickStyle, axisLineColor, gridColor, tooltipContentStyle, tooltipLabelStyle, series } from '../_shared/chartTheme';
import type { ExpenditurePoint } from './chartData';

interface ExpenditureChartProps {
  data: ExpenditurePoint[];
  height?: number;
}

export function ExpenditureChart({ data, height = 220 }: ExpenditureChartProps) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
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
            domain={['dataMin - 50', 'dataMax + 50']}
            width={44}
            tickFormatter={(v: number) => `${v}`}
          />
          <Tooltip
            contentStyle={tooltipContentStyle}
            labelStyle={tooltipLabelStyle}
            labelFormatter={(d: string) => formatDisplayDate(d, true)}
            formatter={(value: number, name: string) =>
              name === 'tdee' ? [`${value} kcal`, 'Estimated TDEE'] : [null, null]
            }
          />
          {/* Stacked-area confidence-band trick: an invisible floor at `lower`, then a
              visible band of height `bandWidth` on top of it — together they cover
              exactly [TDEE-SD, TDEE+SD]. Both share stackId="band" so Recharts stacks
              rather than overlays them. */}
          <Area
            type="monotone"
            dataKey="lower"
            stackId="band"
            stroke="none"
            fill="transparent"
            isAnimationActive={false}
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="bandWidth"
            stackId="band"
            stroke="none"
            fill={series.tdeeBand}
            isAnimationActive={false}
            legendType="none"
          />
          <Line
            type="monotone"
            dataKey="tdee"
            stroke={series.tdeeLine}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <p className="mt-2 text-xs text-ink-muted">
        Shaded band is ±1 SD from the filter&apos;s own fit to your logged data — it reflects
        day-to-day noise, not the full uncertainty in the estimate. Treat it as a lower bound on
        how much this number could be off by, not the whole picture.
      </p>
    </div>
  );
}
