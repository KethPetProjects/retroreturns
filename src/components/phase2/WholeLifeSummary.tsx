import type { WholeLifeComparisonResult } from '../../utils/wholeLifeCalculations';
import { formatDollars, formatPercent } from '../../utils/formatters';

interface WholeLifeSummaryProps {
  result: WholeLifeComparisonResult;
}

export function WholeLifeSummary({ result }: WholeLifeSummaryProps) {
  const { scaledRows, spComparison, guaranteedIrr, nonGuaranteedIrr, guaranteedBreakEvenYear, nonGuaranteedBreakEvenYear } =
    result;
  const finalRow = scaledRows[scaledRows.length - 1];
  const finalSpActual = spComparison.actualBalances.at(-1);
  const finalSpAverage = spComparison.averageBalances.at(-1);

  return (
    <section className="card p-4 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Whole Life Comparison Summary
      </h2>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Guaranteed IRR" value={formatPercent(guaranteedIrr)} hint="Contractual floor" />
        <Metric
          label="Non-Guaranteed IRR"
          value={formatPercent(nonGuaranteedIrr)}
          hint="Assumes current dividend scale continues"
        />
        <Metric
          label="Guaranteed Break-Even Year"
          value={guaranteedBreakEvenYear ? `Year ${guaranteedBreakEvenYear}` : '—'}
        />
        <Metric
          label="Non-Guaranteed Break-Even Year"
          value={nonGuaranteedBreakEvenYear ? `Year ${nonGuaranteedBreakEvenYear}` : '—'}
        />
        <Metric
          label={`Final Guaranteed Cash Value (Year ${finalRow.year})`}
          value={formatDollars(finalRow.guaranteedCashValue)}
        />
        <Metric
          label={`Final Non-Guaranteed Cash Value (Year ${finalRow.year})`}
          value={formatDollars(finalRow.nonGuaranteedCashValue)}
        />
        <Metric
          label="Final S&P Actual (same schedule)"
          value={finalSpActual !== undefined ? formatDollars(finalSpActual) : '—'}
        />
        <Metric
          label="Final S&P Average-Rate (same schedule)"
          value={finalSpAverage !== undefined ? formatDollars(finalSpAverage) : '—'}
        />
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
