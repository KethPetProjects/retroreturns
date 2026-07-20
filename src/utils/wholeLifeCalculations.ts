import { computeMoneyWeightedReturn } from './calculations';
import { scaleIllustration } from './premiumScaling';
import { WHOLE_LIFE_ILLUSTRATION, type WholeLifeYearRow } from '../data/wholeLifeIllustration';

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

export interface WholeLifeComparisonInputs {
  /** 1 = original $20,000/$3,931 illustration; see Section 12.11. */
  premiumScaleRatio: number;
}

export interface WholeLifeComparisonResult {
  /** The full 55-year illustration, scaled by premiumScaleRatio — real reference data, no S&P comparison or Starting Year dependency (decoupled from Phase 1; see Section 12's revision log). */
  scaledRows: WholeLifeYearRow[];
  guaranteedIrr: number | null;
  nonGuaranteedIrr: number | null;
  guaranteedBreakEvenYear: number | null;
  nonGuaranteedBreakEvenYear: number | null;
  isOriginalPremium: boolean;
}

/**
 * Real reference-illustration facts only — IRR, break-even, cash value and
 * death benefit by policy year. Originally also ran an S&P-vs-WL comparison
 * (same premium dollars invested in the S&P instead, using Phase 1's
 * Starting Year), but that coupled Phase 2 to a Starting Year picked for an
 * unrelated purpose (Phase 1's own CAGR/growth-rate exploration). Removed
 * once confirmed it added a second, oddly-coupled "starting year" concept
 * without a clear purpose the illustration's own age-indexed data didn't
 * already serve — Phase 1's top table already owns the "explore S&P growth
 * rates" job.
 */
export function runWholeLifeComparison(inputs: WholeLifeComparisonInputs): WholeLifeComparisonResult {
  const { premiumScaleRatio } = inputs;
  const scaledRows = scaleIllustration(premiumScaleRatio);

  const guaranteedIrr = computeWholeLifeIRR(scaledRows, scaledRows.length, 'guaranteed');
  const nonGuaranteedIrr = computeWholeLifeIRR(scaledRows, scaledRows.length, 'nonGuaranteed');
  const guaranteedBreakEvenYear = computeBreakEvenYear(scaledRows, 'guaranteed');
  const nonGuaranteedBreakEvenYear = computeBreakEvenYear(scaledRows, 'nonGuaranteed');

  return {
    scaledRows,
    guaranteedIrr,
    nonGuaranteedIrr,
    guaranteedBreakEvenYear,
    nonGuaranteedBreakEvenYear,
    isOriginalPremium: premiumScaleRatio === 1,
  };
}
