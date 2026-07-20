import { describe, it, expect } from 'vitest';
import { computeWholeLifeIRR, computeBreakEvenYear, runWholeLifeComparison } from '../wholeLifeCalculations';
import { scaleIllustration, scaleRatioFromFrontLoadedPremium } from '../premiumScaling';
import { WHOLE_LIFE_ILLUSTRATION } from '../../data/wholeLifeIllustration';

describe('computeWholeLifeIRR (Section 12.4)', () => {
  it('produces a guaranteed IRR in the confirmed 1.3-1.9% ballpark at year 30', () => {
    const irr = computeWholeLifeIRR(WHOLE_LIFE_ILLUSTRATION, 30, 'guaranteed');
    expect(irr).not.toBeNull();
    expect(irr!).toBeGreaterThan(0.01);
    expect(irr!).toBeLessThan(0.02);
  });

  it('produces a non-guaranteed IRR in the confirmed ~4.5-5.0% ballpark at year 30', () => {
    const irr = computeWholeLifeIRR(WHOLE_LIFE_ILLUSTRATION, 30, 'nonGuaranteed');
    expect(irr).not.toBeNull();
    expect(irr!).toBeGreaterThan(0.04);
    expect(irr!).toBeLessThan(0.055);
  });

  it('non-guaranteed IRR is always higher than guaranteed IRR at the same checkpoint', () => {
    for (const yearIndex of [22, 30, 31, 40, 55]) {
      const guaranteed = computeWholeLifeIRR(WHOLE_LIFE_ILLUSTRATION, yearIndex, 'guaranteed');
      const nonGuaranteed = computeWholeLifeIRR(WHOLE_LIFE_ILLUSTRATION, yearIndex, 'nonGuaranteed');
      expect(nonGuaranteed!).toBeGreaterThan(guaranteed!);
    }
  });
});

describe('break-even point (Section 12.3)', () => {
  it('confirms non-guaranteed cash value crosses cumulative premium at year 6', () => {
    const cumulativePremiumThroughYear6 = WHOLE_LIFE_ILLUSTRATION.slice(0, 6).reduce(
      (sum, r) => sum + r.premium,
      0,
    );
    expect(cumulativePremiumThroughYear6).toBe(120000);

    const year6 = WHOLE_LIFE_ILLUSTRATION[5];
    expect(year6.guaranteedCashValue).toBeLessThan(cumulativePremiumThroughYear6);
    expect(year6.nonGuaranteedCashValue).toBeGreaterThan(cumulativePremiumThroughYear6);
  });

  it('computeBreakEvenYear matches what the illustration\'s own anchor data shows', () => {
    // Note: the requirements doc's Section 12.3 states break-even occurs at year 6
    // (non-guaranteed) / year 7 (guaranteed), but the doc's own year-5 anchor data
    // (non-guaranteed CV $100,466 vs. cumulative premium $100,000 through year 5)
    // already clears break-even by $466 — one year earlier than the doc's stated
    // conclusion. This assertion matches the actual anchor numbers, not the doc's
    // prose claim; flagged for the user to double-check against the real illustration.
    // Guaranteed: doc says it crosses "partway through year 7" (year-7 snapshot
    // is still $5,067 below), which this annual-snapshot check correctly reports
    // as year 8 — the first year-end where cumulative CV has caught up.
    expect(computeBreakEvenYear(WHOLE_LIFE_ILLUSTRATION, 'nonGuaranteed')).toBe(5);
    expect(computeBreakEvenYear(WHOLE_LIFE_ILLUSTRATION, 'guaranteed')).toBe(8);
  });
});

describe('scaleIllustration (Section 12.11)', () => {
  it('scales every dollar figure linearly, leaving age/year untouched', () => {
    const scaled = scaleIllustration(0.5);
    scaled.forEach((row, i) => {
      const original = WHOLE_LIFE_ILLUSTRATION[i];
      expect(row.year).toBe(original.year);
      expect(row.age).toBe(original.age);
      expect(row.premium).toBeCloseTo(original.premium * 0.5, 6);
      expect(row.guaranteedCashValue).toBeCloseTo(original.guaranteedCashValue * 0.5, 6);
      expect(row.nonGuaranteedCashValue).toBeCloseTo(original.nonGuaranteedCashValue * 0.5, 6);
      expect(row.nonGuaranteedDeathBenefit).toBeCloseTo(original.nonGuaranteedDeathBenefit * 0.5, 6);
    });
  });

  it('preserves IRR exactly under scaling (the known limitation the UI must flag)', () => {
    const scaledRows = scaleIllustration(0.5);
    const originalIrr = computeWholeLifeIRR(WHOLE_LIFE_ILLUSTRATION, 30, 'nonGuaranteed');
    const scaledIrr = computeWholeLifeIRR(scaledRows, 30, 'nonGuaranteed');
    expect(scaledIrr!).toBeCloseTo(originalIrr!, 8);
  });

  it('derives the correct scale ratio from a target front-loaded premium', () => {
    expect(scaleRatioFromFrontLoadedPremium(10000)).toBeCloseTo(0.5, 8);
    expect(scaleRatioFromFrontLoadedPremium(20000)).toBeCloseTo(1, 8);
  });
});

describe('runWholeLifeComparison (integration) — pure WL reference facts, decoupled from Phase 1', () => {
  it('keeps IRR stable across the original and a scaled premium', () => {
    const original = runWholeLifeComparison({ premiumScaleRatio: 1 });
    const scaled = runWholeLifeComparison({ premiumScaleRatio: 0.5 });

    expect(original.isOriginalPremium).toBe(true);
    expect(scaled.isOriginalPremium).toBe(false);
    expect(scaled.nonGuaranteedIrr).toBeCloseTo(original.nonGuaranteedIrr!, 8);
    expect(scaled.scaledRows[6].premium).toBeCloseTo(original.scaledRows[6].premium * 0.5, 6);
  });

  it('always returns the full 55-year illustration — no truncation window', () => {
    const result = runWholeLifeComparison({ premiumScaleRatio: 1 });
    expect(result.scaledRows).toHaveLength(WHOLE_LIFE_ILLUSTRATION.length);
    expect(result.scaledRows.at(-1)!.year).toBe(WHOLE_LIFE_ILLUSTRATION.length);
  });

  it('IRR and break-even describe the full 55-year policy, matching the raw illustration directly', () => {
    const result = runWholeLifeComparison({ premiumScaleRatio: 1 });
    expect(result.guaranteedIrr).toBeCloseTo(
      computeWholeLifeIRR(WHOLE_LIFE_ILLUSTRATION, WHOLE_LIFE_ILLUSTRATION.length, 'guaranteed')!,
      10,
    );
    expect(result.nonGuaranteedIrr).toBeCloseTo(
      computeWholeLifeIRR(WHOLE_LIFE_ILLUSTRATION, WHOLE_LIFE_ILLUSTRATION.length, 'nonGuaranteed')!,
      10,
    );
    expect(result.guaranteedBreakEvenYear).toBe(computeBreakEvenYear(WHOLE_LIFE_ILLUSTRATION, 'guaranteed'));
    expect(result.nonGuaranteedBreakEvenYear).toBe(
      computeBreakEvenYear(WHOLE_LIFE_ILLUSTRATION, 'nonGuaranteed'),
    );
  });

  it('has no S&P comparison or opportunity-cost fields — WL facts only', () => {
    const result = runWholeLifeComparison({ premiumScaleRatio: 1 });
    expect(result).not.toHaveProperty('spComparison');
    expect(result).not.toHaveProperty('opportunityCost');
    expect(result).not.toHaveProperty('finalSpActualAfterTax');
  });
});
