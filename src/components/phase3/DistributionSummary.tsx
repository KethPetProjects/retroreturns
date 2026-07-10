import type { DistributionComparisonResult } from '../../utils/distributionCalculations';
import { formatDollars, formatPercent } from '../../utils/formatters';

interface DistributionSummaryProps {
  result: DistributionComparisonResult;
  stopWorkingAge: number;
  planThroughAge: number;
  averageRateUsed: number;
}

function outcomeLabel(depletedAtYear: number | null, stopWorkingAge: number, planThroughAge: number): string {
  if (depletedAtYear === null) {
    return `Lasted through age ${planThroughAge}`;
  }
  return `Depleted at age ${stopWorkingAge + depletedAtYear - 1} (year ${depletedAtYear})`;
}

export function DistributionSummary({ result, stopWorkingAge, planThroughAge, averageRateUsed }: DistributionSummaryProps) {
  const { years, averageRateTrack, monteCarlo } = result;
  const averageRateStartingBalance = averageRateTrack.rows[0]?.beginningBalance;
  const volatilityStartingBalance = monteCarlo.medianTrialRows[0]?.beginningBalance;

  return (
    <section className="card p-4 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Distribution Summary — {years}-Year Retirement Horizon
      </h2>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Average-Rate Scenario"
          value={outcomeLabel(averageRateTrack.depletedAtYear, stopWorkingAge, planThroughAge)}
          hint={`Starts from ${averageRateStartingBalance !== undefined ? formatDollars(averageRateStartingBalance, false) : '—'} and assumes the portfolio earns the same flat ${formatPercent(averageRateUsed)} every single year (Phase 1's arithmetic-mean rate) — no real market return is ever actually this smooth. Withdrawals still grow with inflation each year; it's the return that's held flat, not the spending.`}
        />
        <Metric
          label="Monte Carlo Success Rate"
          value={formatPercent(monteCarlo.successRatePct, 1)}
          hint={`Starts from ${volatilityStartingBalance !== undefined ? formatDollars(volatilityStartingBalance, false) : '—'} (Phase 1's real sequenced-return balance). ${monteCarlo.trials.toLocaleString()} trials, each randomly resampling real historical annual returns.`}
        />
        <Metric
          label="Median Outcome (Volatility)"
          value={outcomeLabel(monteCarlo.medianDepletionYear, stopWorkingAge, planThroughAge)}
          hint="The middle-ranked simulated trial"
        />
        <Metric
          label="Worst-Decile Outcome (Volatility)"
          value={
            monteCarlo.worstDecileDepletionYear !== null
              ? outcomeLabel(monteCarlo.worstDecileDepletionYear, stopWorkingAge, planThroughAge)
              : 'Fewer than 10% of trials depleted'
          }
          hint="A bad-case reference point, not the worst simulated trial"
        />
      </dl>
      <p className="mt-4 text-xs text-slate-500">
        These two scenarios aren't a fair fight, on purpose: they even start from different
        balances, carried over from Phase 1's Average-Rate vs. Actual tracks. The Average-Rate
        scenario's flat {formatPercent(averageRateUsed)} is an arithmetic mean and tends to
        overstate what a portfolio can actually sustain long-term — real returns compound
        unevenly, and bad years hurt more than good years help. That's why it can look
        comfortably sustainable while the Monte Carlo scenario, built from real historical
        volatility, shows meaningfully more risk at the same spending level. Sequence-of-returns
        risk in retirement also cuts the opposite direction from the accumulation phase: a bad
        sequence early in retirement can deplete a portfolio faster than smooth average-rate math
        would ever suggest, even at a similar average return.
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
