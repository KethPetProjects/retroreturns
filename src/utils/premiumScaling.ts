import { WHOLE_LIFE_ILLUSTRATION, ORIGINAL_FRONT_LOADED_PREMIUM, type WholeLifeYearRow } from '../data/wholeLifeIllustration';

/**
 * Linearly scales every dollar figure in the whole life illustration by the
 * given ratio (Section 12.11). This is an approximation, not a real quote —
 * whole life pricing does not scale linearly with premium in reality (fixed
 * policy costs and mortality charges don't shrink proportionally), so this
 * preserves the illustration's IRR exactly rather than modeling the lower
 * real-world rate a smaller policy would actually have. Callers must surface
 * the required warning (Section 12.11) whenever scaleRatio !== 1.
 */
export function scaleIllustration(scaleRatio: number): WholeLifeYearRow[] {
  if (scaleRatio === 1) return WHOLE_LIFE_ILLUSTRATION;

  return WHOLE_LIFE_ILLUSTRATION.map((row) => ({
    ...row,
    premium: row.premium * scaleRatio,
    guaranteedCashValue: row.guaranteedCashValue * scaleRatio,
    nonGuaranteedCashValue: row.nonGuaranteedCashValue * scaleRatio,
    dividend: row.dividend * scaleRatio,
    guaranteedDeathBenefit: row.guaranteedDeathBenefit * scaleRatio,
    nonGuaranteedDeathBenefit: row.nonGuaranteedDeathBenefit * scaleRatio,
  }));
}

/** Derives the scale ratio from a target front-loaded (years 1-7) annual premium amount. */
export function scaleRatioFromFrontLoadedPremium(targetAnnualPremium: number): number {
  return targetAnnualPremium / ORIGINAL_FRONT_LOADED_PREMIUM;
}
