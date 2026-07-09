import type { SimulationResult } from '../types';
import { formatDollars, formatPercent } from '../utils/formatters';

interface SummarySectionProps {
  result: SimulationResult;
}

export function SummarySection({ result }: SummarySectionProps) {
  const gapIsPositive = result.dollarDifference >= 0;

  return (
    <section className="card p-4 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Summary</h2>

      <div className="mb-6 rounded-lg border border-navy-600 bg-navy-800/60 p-4 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Dollar Difference — the "myth of average returns" gap
        </p>
        <p
          className={`mt-1 text-3xl font-bold sm:text-4xl ${gapIsPositive ? 'text-loss-400' : 'text-gain-400'}`}
        >
          {formatDollars(result.dollarDifference)}
        </p>
        <p className="mt-1 text-sm text-slate-400">
          {formatPercent(result.percentDifference)} of the final actual amount
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Total Contributed" value={formatDollars(result.totalContributed)} />
        <Metric label="Final Actual Amount" value={formatDollars(result.finalActualValue)} />
        <Metric label="Final Average-Rate Amount" value={formatDollars(result.finalAverageValue)} />
        <Metric label="Final CAGR (Actual)" value={formatPercent(result.finalCagrActual)} />
        <Metric label="Average Rate Used" value={formatPercent(result.averageRateUsed)} />
        <Metric label="Management Fee Applied" value={formatPercent(result.managementFeePct)} />
        <Metric
          label="Fee Impact ($)"
          value={formatDollars(result.feeImpactDollars)}
          hint="Cost of the fee alone, vs. a 0.03% baseline index-fund fee"
        />
        <Metric label="Tax Rate Applied" value={formatPercent(result.taxRatePct)} />
      </dl>
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold text-slate-100">{value}</dd>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
