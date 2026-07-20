import type { DistributionComparisonResult } from '../../utils/distributionCalculations';
import { formatDollars, formatPercent } from '../../utils/formatters';

type StartingBalanceSource = 'lifecycle' | 'override' | 'accumulation';

interface DistributionSummaryProps {
  result: DistributionComparisonResult;
  stopWorkingAge: number;
  planThroughAge: number;
  startingBalanceSource: StartingBalanceSource;
}

function startingBalanceHint(source: StartingBalanceSource): string {
  switch (source) {
    case 'lifecycle':
      return "Projected from Current Balance + Annual Contribution using this trial's own market sequence — not a fixed number, varies by trial";
    case 'override':
      return 'Manually entered via Starting Balance Override, not carried over from the Accumulation tab';
    case 'accumulation':
      return "Carried over from the Accumulation tab's real sequenced-return ending balance";
  }
}

function outcomeLabel(depletedAtYear: number | null, stopWorkingAge: number, planThroughAge: number): string {
  if (depletedAtYear === null) {
    return `Lasted through age ${planThroughAge}`;
  }
  return `Depleted at age ${stopWorkingAge + depletedAtYear - 1} (year ${depletedAtYear})`;
}

export function DistributionSummary({
  result,
  stopWorkingAge,
  planThroughAge,
  startingBalanceSource,
}: DistributionSummaryProps) {
  const { years, monteCarlo, rmdStartAge, historicalDataStartYear, historicalDataEndYear } = result;
  const startingBalance = monteCarlo.medianTrialRows[0]?.beginningBalance;

  return (
    <section className="card p-4 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Distribution Summary — {years}-Year Retirement Horizon
      </h2>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Starting Balance"
          value={startingBalance !== undefined ? formatDollars(startingBalance, false) : '—'}
          hint={startingBalanceHint(startingBalanceSource)}
        />
        <Metric
          label="Monte Carlo Success Rate"
          value={formatPercent(monteCarlo.successRatePct, 1)}
          hint={`${monteCarlo.trials.toLocaleString()} trials, resampling real historical annual returns from ${historicalDataStartYear}–${historicalDataEndYear}`}
        />
        <Metric
          label="Median Outcome"
          value={outcomeLabel(monteCarlo.medianDepletionYear, stopWorkingAge, planThroughAge)}
          hint="The middle-ranked simulated trial"
        />
        <Metric
          label="Worst-Decile Outcome"
          value={
            monteCarlo.worstDecileDepletionYear !== null
              ? outcomeLabel(monteCarlo.worstDecileDepletionYear, stopWorkingAge, planThroughAge)
              : 'Fewer than 10% of trials depleted'
          }
          hint="A bad-case reference point, not the worst simulated trial"
        />
      </dl>
      <p className="mt-4 text-xs text-slate-500">
        Sequence-of-returns risk in retirement usually cuts the opposite direction from the
        accumulation phase: a bad sequence of returns early in retirement can deplete a portfolio
        much faster than a flat average return would ever suggest — that's exactly what the
        spread between the success rate, median outcome, and worst-decile outcome above is
        showing.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Required Minimum Distributions begin at age {rmdStartAge} (per SECURE 2.0, based on Current
        Age) and are always modeled, assuming the whole portfolio is a tax-deferred account —
        withdrawals are forced up to the IRS-required minimum in any year that exceeds what the
        expense/LTC plan alone would have withdrawn (flagged in the table below as "RMD?").
      </p>
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
