import type { WholeLifeComparisonResult } from '../../utils/wholeLifeCalculations';
import { formatDollars } from '../../utils/formatters';

interface OpportunityCostCalloutProps {
  result: WholeLifeComparisonResult;
  nonAppuaPremiumPerYear: number;
}

export function OpportunityCostCallout({ result, nonAppuaPremiumPerYear }: OpportunityCostCalloutProps) {
  const { opportunityCost, scaledRows } = result;
  const finalYear = scaledRows[scaledRows.length - 1].year;
  const finalActual = opportunityCost.actualBalances.at(-1);
  const finalAverage = opportunityCost.averageBalances.at(-1);

  return (
    <section className="card border-sky-800/40 p-4 sm:p-6">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-sky-400">
        Opportunity Cost of the Insurance-Cost Premium
      </h2>
      <p className="text-sm text-slate-300">
        If the {formatDollars(nonAppuaPremiumPerYear, false)}/year insurance-cost portion of your
        premium (Base Contract + FPR — the dollars that pay for the policy itself, not the APPUA
        cash-value dollars) had instead been invested in the S&amp;P 500, it would be worth{' '}
        <span className="font-semibold text-slate-100">
          {finalActual !== undefined ? formatDollars(finalActual) : '—'}
        </span>{' '}
        (actual sequenced returns) or{' '}
        <span className="font-semibold text-slate-100">
          {finalAverage !== undefined ? formatDollars(finalAverage) : '—'}
        </span>{' '}
        (average-rate) by year {finalYear}.
      </p>
      <p className="mt-2 text-xs text-slate-500">
        This is the opportunity cost of the insurance protection itself, separate from the APPUA
        dollars already compared above — it is not meant to imply those dollars were "wasted."
        They purchased real death benefit protection the S&amp;P side never had. This figure exists
        so you can weigh protection value against foregone market growth yourself.
      </p>
    </section>
  );
}
