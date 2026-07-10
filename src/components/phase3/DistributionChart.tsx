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
import type { DistributionComparisonResult } from '../../utils/distributionCalculations';
import { formatDollars } from '../../utils/formatters';

interface DistributionChartProps {
  result: DistributionComparisonResult;
  stopWorkingAge: number;
}

export function DistributionChart({ result, stopWorkingAge }: DistributionChartProps) {
  const { averageRateTrack, monteCarlo } = result;
  const maxLen = Math.max(averageRateTrack.rows.length, monteCarlo.medianTrialRows.length);

  const chartData = Array.from({ length: maxLen }, (_, i) => {
    const yearIndex = i + 1;
    return {
      age: stopWorkingAge + yearIndex - 1,
      averageRateBalance: averageRateTrack.rows[i]?.endingBalance,
      volatilityBalance: monteCarlo.medianTrialRows[i]?.endingBalance,
    };
  });

  return (
    <section className="card p-4 sm:p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Distribution: Average-Rate vs. Volatility (Monte Carlo Median Path)
      </h2>
      <p className="mb-2 text-xs text-slate-500">
        The volatility line is one representative simulated path (the median outcome across{' '}
        {monteCarlo.trials.toLocaleString()} randomized trials) — not a single forecast. See the
        summary below for the full distribution of outcomes.
      </p>
      <div className="h-80 w-full sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e273b" />
            <XAxis
              dataKey="age"
              stroke="#64748b"
              fontSize={12}
              label={{ value: 'Age', position: 'insideBottom', offset: -2, fill: '#64748b' }}
            />
            <YAxis
              stroke="#64748b"
              fontSize={12}
              tickFormatter={(v) => formatDollars(v, false)}
              width={80}
            />
            <Tooltip content={<DistributionTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Line
              type="monotone"
              dataKey="averageRateBalance"
              name="Average-Rate"
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="6 5"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="volatilityBalance"
              name="Volatility (median simulated path)"
              stroke="#4ade80"
              strokeWidth={2.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function DistributionTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-navy-600 bg-navy-800 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-200">Age {label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value !== undefined ? formatDollars(p.value) : '—'}
        </p>
      ))}
    </div>
  );
}
