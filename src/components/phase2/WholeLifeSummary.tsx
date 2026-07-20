import type { WholeLifeComparisonResult } from '../../utils/wholeLifeCalculations';
import { formatDollars, formatPercent } from '../../utils/formatters';

interface WholeLifeSummaryProps {
  result: WholeLifeComparisonResult;
}

export function WholeLifeSummary({ result }: WholeLifeSummaryProps) {
  const { scaledRows, guaranteedIrr, nonGuaranteedIrr, guaranteedBreakEvenYear, nonGuaranteedBreakEvenYear } =
    result;
  const finalRow = scaledRows[scaledRows.length - 1];

  return (
    <section className="card p-4 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Whole Life Policy Summary
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
          label={`Final Guaranteed Cash Value (Year ${finalRow.year}, Age ${finalRow.age})`}
          value={formatDollars(finalRow.guaranteedCashValue)}
          hint="Policy loans against this are typically tax-free while the policy stays in force"
        />
        <Metric
          label={`Final Non-Guaranteed Cash Value (Year ${finalRow.year}, Age ${finalRow.age})`}
          value={formatDollars(finalRow.nonGuaranteedCashValue)}
          hint="Policy loans against this are typically tax-free while the policy stays in force"
        />
        <Metric
          label={`Final Guaranteed Death Benefit (Year ${finalRow.year}, Age ${finalRow.age})`}
          value={formatDollars(finalRow.guaranteedDeathBenefit)}
          hint="This isn't accumulation value, it's protection value"
        />
        <Metric
          label={`Final Non-Guaranteed Death Benefit (Year ${finalRow.year}, Age ${finalRow.age})`}
          value={formatDollars(finalRow.nonGuaranteedDeathBenefit)}
          hint="This isn't accumulation value, it's protection value"
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
