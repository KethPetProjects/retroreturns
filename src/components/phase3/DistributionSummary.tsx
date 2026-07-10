import type { DistributionComparisonResult } from '../../utils/distributionCalculations';
import { formatPercent } from '../../utils/formatters';

interface DistributionSummaryProps {
  result: DistributionComparisonResult;
  stopWorkingAge: number;
  planThroughAge: number;
}

function outcomeLabel(depletedAtYear: number | null, stopWorkingAge: number, planThroughAge: number): string {
  if (depletedAtYear === null) {
    return `Lasted through age ${planThroughAge}`;
  }
  return `Depleted at age ${stopWorkingAge + depletedAtYear - 1} (year ${depletedAtYear})`;
}

export function DistributionSummary({ result, stopWorkingAge, planThroughAge }: DistributionSummaryProps) {
  const { years, averageRateTrack, monteCarlo } = result;

  return (
    <section className="card p-4 sm:p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Distribution Summary — {years}-Year Retirement Horizon
      </h2>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Average-Rate Scenario"
          value={outcomeLabel(averageRateTrack.depletedAtYear, stopWorkingAge, planThroughAge)}
          hint="Smooth, flat-rate withdrawal — unrealistic, but the easy-to-model baseline"
        />
        <Metric
          label="Monte Carlo Success Rate"
          value={formatPercent(monteCarlo.successRatePct, 1)}
          hint={`${monteCarlo.trials.toLocaleString()} trials, each randomly resampling real historical annual returns`}
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
        Sequence-of-returns risk in retirement usually cuts the opposite direction from the
        accumulation phase: a bad sequence of returns early in retirement can deplete the volatile
        track faster than the smooth average-rate math ever suggests, even at the same average
        return.
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
