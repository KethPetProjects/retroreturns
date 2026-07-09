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
import { MAX_COMPARISON_YEARS, type WholeLifeComparisonResult } from '../../utils/wholeLifeCalculations';
import { formatDollars } from '../../utils/formatters';

interface ComparisonChartProps {
  result: WholeLifeComparisonResult;
}

export function ComparisonChart({ result }: ComparisonChartProps) {
  const { scaledRows, spComparison, comparisonYears } = result;

  const chartData = scaledRows.map((row, i) => ({
    policyYear: row.year,
    guaranteedCV: row.guaranteedCashValue,
    nonGuaranteedCV: row.nonGuaranteedCashValue,
    spActual: spComparison.actualBalances[i],
    spAverage: spComparison.averageBalances[i],
  }));

  return (
    <section className="card p-4 sm:p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Whole Life vs. S&amp;P 500 — Same Funding Schedule
      </h2>
      <p className="mb-2 text-xs text-slate-500">
        Whole life cash value (left axis) and the S&amp;P comparison (right axis) are plotted on
        separate scales — over a long horizon the S&amp;P side compounds to many times the whole
        life cash value, so a shared axis would flatten the WL lines to nearly nothing.
      </p>
      <p className="mb-2 text-xs text-slate-500">
        Showing the first {comparisonYears} of {MAX_COMPARISON_YEARS} illustration years, matching
        the Number of Years selected in the Accumulation section above.
        {comparisonYears < MAX_COMPARISON_YEARS &&
          ` Years ${comparisonYears + 1}-${MAX_COMPARISON_YEARS} aren't shown yet — they'll be relevant once the distribution-phase (Phase 3/4) comparison is built.`}
      </p>
      {spComparison.truncated && (
        <p className="mb-2 text-xs text-amber-400">
          Real S&amp;P data only covers {spComparison.years.length} of these {comparisonYears} years
          from this starting year — the S&amp;P lines stop early while the whole life lines continue
          through year {comparisonYears}.
        </p>
      )}
      <div className="h-80 w-full sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e273b" />
            <XAxis
              dataKey="policyYear"
              stroke="#64748b"
              fontSize={12}
              label={{ value: 'Policy Year', position: 'insideBottom', offset: -2, fill: '#64748b' }}
            />
            <YAxis
              yAxisId="wl"
              stroke="#4ade80"
              fontSize={12}
              tickFormatter={(v) => formatDollars(v, false)}
              width={80}
              label={{ value: 'Whole Life Cash Value', angle: -90, position: 'insideLeft', fill: '#4ade80', fontSize: 11 }}
            />
            <YAxis
              yAxisId="sp"
              orientation="right"
              stroke="#38bdf8"
              fontSize={12}
              tickFormatter={(v) => formatDollars(v, false)}
              width={90}
              label={{ value: 'S&P Comparison', angle: 90, position: 'insideRight', fill: '#38bdf8', fontSize: 11 }}
            />
            <Tooltip content={<ComparisonTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            <Line
              yAxisId="wl"
              type="monotone"
              dataKey="nonGuaranteedCV"
              name="WL Non-Guaranteed Cash Value"
              stroke="#4ade80"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              yAxisId="wl"
              type="monotone"
              dataKey="guaranteedCV"
              name="WL Guaranteed Cash Value"
              stroke="#22c55e"
              strokeWidth={2}
              strokeDasharray="2 3"
              dot={false}
            />
            <Line
              yAxisId="sp"
              type="monotone"
              dataKey="spActual"
              name="S&P Actual (same schedule)"
              stroke="#38bdf8"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              yAxisId="sp"
              type="monotone"
              dataKey="spAverage"
              name="S&P Average-Rate"
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="6 5"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function ComparisonTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border border-navy-600 bg-navy-800 px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-200">Policy Year {label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value !== undefined ? formatDollars(p.value) : '—'}
        </p>
      ))}
    </div>
  );
}
