import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SimulationYearRow } from '../types';
import { formatDollars, formatPercent } from '../utils/formatters';

interface GrowthChartProps {
  rows: SimulationYearRow[];
}

export function GrowthChart({ rows }: GrowthChartProps) {
  const chartData = rows.map((r) => ({
    year: r.year,
    actual: r.actualBalance,
    average: r.averageBalance,
    totalReturn: r.totalReturn,
  }));

  return (
    <section className="card p-4 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Growth Over Time
      </h2>
      <div className="h-80 w-full sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e273b" />
            <XAxis dataKey="year" stroke="#64748b" fontSize={12} />
            <YAxis
              stroke="#64748b"
              fontSize={12}
              tickFormatter={(v) => formatDollars(v, false)}
              width={80}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 13, paddingTop: 8 }} />
            <Line
              type="monotone"
              dataKey="actual"
              name="My Actual Amount"
              stroke="#4ade80"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="average"
              name="Average-Rate Amount"
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="6 5"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const actual = payload.find((p: any) => p.dataKey === 'actual')?.value ?? 0;
  const average = payload.find((p: any) => p.dataKey === 'average')?.value ?? 0;
  const totalReturn = payload[0]?.payload?.totalReturn ?? 0;
  const gap = average - actual;

  return (
    <div className="rounded-md border border-navy-600 bg-navy-800 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-200">Year {label}</p>
      <p className="text-gain-400">My Actual Amount: {formatDollars(actual)}</p>
      <p className="text-slate-400">Average-Rate Amount: {formatDollars(average)}</p>
      <p className="mt-1 text-slate-300">Gap: {formatDollars(gap)}</p>
      <p className="text-slate-400">S&P 500 Total Return: {formatPercent(totalReturn)}</p>
    </div>
  );
}
