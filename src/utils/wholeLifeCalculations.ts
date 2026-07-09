import {
  runBalanceTrack,
  arithmeticMean,
  computeMoneyWeightedReturn,
  getHistoricalReturnsForRangeClamped,
  BASELINE_FEE_PCT,
} from './calculations';
import { scaleIllustration } from './premiumScaling';
import { NON_APPUA_PREMIUM, type WholeLifeYearRow } from '../data/wholeLifeIllustration';

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
}

export function runWholeLifeComparison(inputs: WholeLifeComparisonInputs): WholeLifeComparisonResult {
  const { spStartingYear, premiumScaleRatio } = inputs;
  const scaledRows = scaleIllustration(premiumScaleRatio);
  const finalYearIndex = scaledRows.length;

  // IRR and break-even are scale-invariant (see computeWholeLifeIRR doc comment)
  // — compute from the unscaled ratio-1 illustration for a stable source of truth.
  const unscaledRows = scaleIllustration(1);
  const guaranteedIrr = computeWholeLifeIRR(unscaledRows, finalYearIndex, 'guaranteed');
  const nonGuaranteedIrr = computeWholeLifeIRR(unscaledRows, finalYearIndex, 'nonGuaranteed');
  const guaranteedBreakEvenYear = computeBreakEvenYear(unscaledRows, 'guaranteed');
  const nonGuaranteedBreakEvenYear = computeBreakEvenYear(unscaledRows, 'nonGuaranteed');

  const premiumSchedule = scaledRows.map((r) => r.premium);
  const spComparison = runSpComparisonForSchedule(spStartingYear, premiumSchedule);

  const nonAppuaPremium = NON_APPUA_PREMIUM * premiumScaleRatio;
  const opportunityCost = computeOpportunityCost(spStartingYear, scaledRows.length, nonAppuaPremium);

  return {
    scaledRows,
    guaranteedIrr,
    nonGuaranteedIrr,
    guaranteedBreakEvenYear,
    nonGuaranteedBreakEvenYear,
    spComparison,
    opportunityCost,
    isOriginalPremium: premiumScaleRatio === 1,
  };
}
