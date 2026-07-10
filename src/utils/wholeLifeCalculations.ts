import {
  runBalanceTrack,
  arithmeticMean,
  computeMoneyWeightedReturn,
  getHistoricalReturnsForRangeClamped,
  BASELINE_FEE_PCT,
} from './calculations';
import { scaleIllustration } from './premiumScaling';
import {
  NON_APPUA_PREMIUM,
  WHOLE_LIFE_ILLUSTRATION,
  type WholeLifeYearRow,
} from '../data/wholeLifeIllustration';

export const MAX_COMPARISON_YEARS = WHOLE_LIFE_ILLUSTRATION.length;

export type CashValueTrack = 'guaranteed' | 'nonGuaranteed';

/**
 * First policy year in which cumulative premiums paid are fully recovered by
 * cash value (Section 12.3) — scale-invariant, like IRR, since both sides of
 * the comparison scale by the same ratio.
 */
export function computeBreakEvenYear(rows: WholeLifeYearRow[], track: CashValueTrack): number | null {
  let cumulativePremium = 0;
  for (const row of rows) {
    cumulativePremium += row.premium;
    const cashValue = track === 'guaranteed' ? row.guaranteedCashValue : row.nonGuaranteedCashValue;
    if (cashValue >= cumulativePremium) return row.year;
  }
  return null;
}

/**
 * Money-weighted IRR for the whole life policy through a given year, using
 * the actual premium schedule as contributions and that year's cash value as
 * the terminal outflow (Section 12.4). Linear premium scaling (Section 12.11)
 * doesn't change this rate — scaling every cash flow by the same ratio leaves
 * the rate that zeroes NPV unchanged — so callers can compute this once from
 * the original (unscaled) illustration regardless of the active scale.
 */
export function computeWholeLifeIRR(
  rows: WholeLifeYearRow[],
  throughYearIndex: number,
  track: CashValueTrack,
): number | null {
  const premiums = rows.slice(0, throughYearIndex).map((r) => r.premium);
  const cashValueAtYear =
    track === 'guaranteed'
      ? rows[throughYearIndex - 1].guaranteedCashValue
      : rows[throughYearIndex - 1].nonGuaranteedCashValue;

  return computeMoneyWeightedReturn(0, premiums, cashValueAtYear, throughYearIndex);
}

export interface SpScheduleComparisonResult {
  years: number[];
  actualBalances: number[];
  averageBalances: number[];
  averageRateUsed: number;
  truncated: boolean;
}

/**
 * Runs an arbitrary premium schedule (e.g. the WL policy's 7-pay schedule)
 * through Phase 1's generic compounding engine, for an apples-to-apples S&P
 * comparison against the whole life cash value tracks (Section 12.5). Reuses
 * runBalanceTrack directly rather than Phase 1's runSimulation wrapper, since
 * runSimulation assumes a flat contribution amount.
 */
export function runSpComparisonForSchedule(
  startingYear: number,
  premiums: number[],
  feePct: number = BASELINE_FEE_PCT,
): SpScheduleComparisonResult {
  const { years, totalReturns, truncated } = getHistoricalReturnsForRangeClamped(
    startingYear,
    premiums.length,
  );
  const clampedPremiums = premiums.slice(0, years.length);

  const averageRateUsed = arithmeticMean(totalReturns);
  const averageRates = new Array(years.length).fill(averageRateUsed);

  const actualTrack = runBalanceTrack(0, clampedPremiums, totalReturns, feePct);
  const averageTrack = runBalanceTrack(0, clampedPremiums, averageRates, feePct);

  return {
    years,
    actualBalances: actualTrack.endingBalances,
    averageBalances: averageTrack.endingBalances,
    averageRateUsed,
    truncated,
  };
}

/**
 * Opportunity cost of the insurance-cost (non-APPUA) premium dollars, run
 * through the same S&P engine as its own independent side calculation
 * (Section 12.9) — not blended into the main WL-vs-S&P comparison.
 */
export function computeOpportunityCost(
  startingYear: number,
  numberOfYears: number,
  nonAppuaPremiumPerYear: number = NON_APPUA_PREMIUM,
  feePct: number = BASELINE_FEE_PCT,
): SpScheduleComparisonResult {
  const premiums = new Array(numberOfYears).fill(nonAppuaPremiumPerYear);
  return runSpComparisonForSchedule(startingYear, premiums, feePct);
}

export interface WholeLifeComparisonInputs {
  spStartingYear: number;
  premiumScaleRatio: number; // 1 = original $20,000/$3,931 illustration
  /**
   * Limits the comparison to the first N years of the 55-year illustration
   * (e.g. matching Phase 1's Number of Years), so the accumulation-phase
   * comparison doesn't run further than what's actually being compared.
   * Years beyond this are simply not included yet — not lost — pending
   * Phase 3/4's distribution-phase modeling. Clamped to [1, 55].
   */
  comparisonYears: number;
  /**
   * Management fee applied to the S&P side (spComparison and opportunityCost),
   * synced from Phase 1's own Management Fee input rather than silently
   * defaulting to BASELINE_FEE_PCT — otherwise the "same funding schedule"
   * comparison (Section 12.5) quietly stops being apples-to-apples the moment
   * a user changes Phase 1's fee to model something other than a pristine
   * low-cost index fund.
   */
  feePct: number;
  /**
   * Phase 1's simplified end-of-period tax haircut (Section 3.4's placeholder
   * tax model), applied only to the S&P side's final lump-sum values — not to
   * WL cash value. This mirrors a real structural asymmetry, not an oversight:
   * an S&P withdrawal is a taxable event, while a whole life policy loan is
   * typically received tax-free as long as the policy stays in force (Section
   * 12.10 caveat 5). Applying tax to WL cash value here would misrepresent it.
   */
  taxRatePct: number;
}

export interface WholeLifeComparisonResult {
  scaledRows: WholeLifeYearRow[];
  guaranteedIrr: number | null;
  nonGuaranteedIrr: number | null;
  guaranteedBreakEvenYear: number | null;
  nonGuaranteedBreakEvenYear: number | null;
  spComparison: SpScheduleComparisonResult;
  opportunityCost: SpScheduleComparisonResult;
  isOriginalPremium: boolean;
  comparisonYears: number;
  taxRatePct: number;
  /** Final S&P values after applying taxRatePct as a lump-sum-withdrawal haircut — see taxRatePct doc comment. */
  finalSpActualAfterTax: number;
  finalSpAverageAfterTax: number;
  finalOpportunityCostActualAfterTax: number;
  finalOpportunityCostAverageAfterTax: number;
}

export function runWholeLifeComparison(inputs: WholeLifeComparisonInputs): WholeLifeComparisonResult {
  const { spStartingYear, premiumScaleRatio, feePct, taxRatePct } = inputs;
  const comparisonYears = Math.min(Math.max(1, Math.trunc(inputs.comparisonYears)), MAX_COMPARISON_YEARS);

  const scaledRows = scaleIllustration(premiumScaleRatio).slice(0, comparisonYears);

  // IRR and break-even describe the policy itself over its full 55-year
  // schedule, not "whatever window this particular comparison happens to be
  // showing" — computing them on a truncated window produces nonsensical
  // rates at low comparisonYears (a short premium stream with no time to
  // recover its own front-loaded cost has no stable, meaningful IRR).
  // Scale-invariant too (see computeWholeLifeIRR doc comment), so compute
  // from the unscaled, un-truncated illustration regardless of comparisonYears.
  const fullUnscaledRows = scaleIllustration(1);
  const fullYears = fullUnscaledRows.length;
  const guaranteedIrr = computeWholeLifeIRR(fullUnscaledRows, fullYears, 'guaranteed');
  const nonGuaranteedIrr = computeWholeLifeIRR(fullUnscaledRows, fullYears, 'nonGuaranteed');
  const guaranteedBreakEvenYear = computeBreakEvenYear(fullUnscaledRows, 'guaranteed');
  const nonGuaranteedBreakEvenYear = computeBreakEvenYear(fullUnscaledRows, 'nonGuaranteed');

  const premiumSchedule = scaledRows.map((r) => r.premium);
  const spComparison = runSpComparisonForSchedule(spStartingYear, premiumSchedule, feePct);

  const nonAppuaPremium = NON_APPUA_PREMIUM * premiumScaleRatio;
  const opportunityCost = computeOpportunityCost(spStartingYear, scaledRows.length, nonAppuaPremium, feePct);

  const finalSpActualAfterTax = spComparison.actualBalances.at(-1)! * (1 - taxRatePct);
  const finalSpAverageAfterTax = spComparison.averageBalances.at(-1)! * (1 - taxRatePct);
  const finalOpportunityCostActualAfterTax = opportunityCost.actualBalances.at(-1)! * (1 - taxRatePct);
  const finalOpportunityCostAverageAfterTax = opportunityCost.averageBalances.at(-1)! * (1 - taxRatePct);

  return {
    scaledRows,
    guaranteedIrr,
    nonGuaranteedIrr,
    guaranteedBreakEvenYear,
    nonGuaranteedBreakEvenYear,
    spComparison,
    opportunityCost,
    isOriginalPremium: premiumScaleRatio === 1,
    comparisonYears,
    taxRatePct,
    finalSpActualAfterTax,
    finalSpAverageAfterTax,
    finalOpportunityCostActualAfterTax,
    finalOpportunityCostAverageAfterTax,
  };
}
