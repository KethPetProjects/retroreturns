import { describe, it, expect } from 'vitest';
import {
  computeWholeLifeIRR,
  computeBreakEvenYear,
  runSpComparisonForSchedule,
  computeOpportunityCost,
  runWholeLifeComparison,
} from '../wholeLifeCalculations';
import { scaleIllustration, scaleRatioFromFrontLoadedPremium } from '../premiumScaling';
import { WHOLE_LIFE_ILLUSTRATION, NON_APPUA_PREMIUM } from '../../data/wholeLifeIllustration';

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

describe('runSpComparisonForSchedule', () => {
  it('runs the 7-pay schedule through the S&P engine and truncates gracefully near the data boundary', () => {
    const premiums = WHOLE_LIFE_ILLUSTRATION.map((r) => r.premium); // 55 years
    const result = runSpComparisonForSchedule(1990, premiums); // 1990 + 55 = 2045, past 2025 data
    expect(result.truncated).toBe(true);
    expect(result.years.length).toBeLessThan(55);
    expect(result.actualBalances.length).toBe(result.years.length);
  });

  it('does not truncate when the full window fits inside the dataset', () => {
    const premiums = WHOLE_LIFE_ILLUSTRATION.map((r) => r.premium);
    const result = runSpComparisonForSchedule(1970, premiums); // 1970 + 55 = 2025, exactly fits
    expect(result.truncated).toBe(false);
    expect(result.years.length).toBe(55);
  });
});

describe('computeOpportunityCost (Section 12.9)', () => {
  it('runs the flat non-APPUA premium stream through the S&P engine', () => {
    const result = computeOpportunityCost(1970, 55);
    expect(result.years.length).toBe(55);
    expect(result.actualBalances[result.actualBalances.length - 1]).toBeGreaterThan(0);
  });

  it('scales proportionally when a scaled non-APPUA premium is passed', () => {
    const full = computeOpportunityCost(1970, 10, NON_APPUA_PREMIUM);
    const half = computeOpportunityCost(1970, 10, NON_APPUA_PREMIUM / 2);
    const lastFull = full.actualBalances[full.actualBalances.length - 1];
    const lastHalf = half.actualBalances[half.actualBalances.length - 1];
    expect(lastHalf).toBeCloseTo(lastFull / 2, 4);
  });
});

describe('runWholeLifeComparison (integration)', () => {
  it('keeps IRR stable across the original and a scaled premium', () => {
    const original = runWholeLifeComparison({ spStartingYear: 1970, premiumScaleRatio: 1, comparisonYears: 55 });
    const scaled = runWholeLifeComparison({ spStartingYear: 1970, premiumScaleRatio: 0.5, comparisonYears: 55 });

    expect(original.isOriginalPremium).toBe(true);
    expect(scaled.isOriginalPremium).toBe(false);
    expect(scaled.nonGuaranteedIrr).toBeCloseTo(original.nonGuaranteedIrr!, 8);
    expect(scaled.scaledRows[6].premium).toBeCloseTo(original.scaledRows[6].premium * 0.5, 6);
  });

  it('produces a distinct opportunity-cost result from the main S&P comparison', () => {
    const result = runWholeLifeComparison({ spStartingYear: 1970, premiumScaleRatio: 1, comparisonYears: 55 });
    const finalOppCost = result.opportunityCost.actualBalances.at(-1)!;
    const finalMainComparison = result.spComparison.actualBalances.at(-1)!;
    expect(finalOppCost).toBeLessThan(finalMainComparison); // non-APPUA-only stream is a small slice of total premium
  });

  it('limits the chart/S&P comparison to comparisonYears, ignoring later illustration years', () => {
    const result = runWholeLifeComparison({ spStartingYear: 1970, premiumScaleRatio: 1, comparisonYears: 30 });
    expect(result.scaledRows).toHaveLength(30);
    expect(result.comparisonYears).toBe(30);
    expect(result.scaledRows.at(-1)!.year).toBe(30);
  });

  it('clamps comparisonYears to [1, 55]', () => {
    const tooMany = runWholeLifeComparison({ spStartingYear: 1970, premiumScaleRatio: 1, comparisonYears: 200 });
    expect(tooMany.comparisonYears).toBe(55);
    const tooFew = runWholeLifeComparison({ spStartingYear: 1970, premiumScaleRatio: 1, comparisonYears: 0 });
    expect(tooFew.comparisonYears).toBe(1);
  });

  it('keeps IRR and break-even describing the full 55-year policy regardless of comparisonYears (Bug A regression)', () => {
    // Before this fix, IRR/break-even were computed on the truncated comparisonYears
    // window, which produced nonsensical rates at low year counts (e.g. negative IRR
    // at comparisonYears=1) that contradicted the doc's confirmed ~1.3-1.8%/4.8-5.0%
    // figures. IRR and break-even should be stable no matter how much of the
    // illustration this particular comparison window is showing.
    const full = runWholeLifeComparison({ spStartingYear: 1970, premiumScaleRatio: 1, comparisonYears: 55 });
    const oneYear = runWholeLifeComparison({ spStartingYear: 1970, premiumScaleRatio: 1, comparisonYears: 1 });
    const sixYears = runWholeLifeComparison({ spStartingYear: 1970, premiumScaleRatio: 1, comparisonYears: 6 });
    const thirtyYears = runWholeLifeComparison({ spStartingYear: 1970, premiumScaleRatio: 1, comparisonYears: 30 });

    for (const result of [oneYear, sixYears, thirtyYears]) {
      expect(result.guaranteedIrr).toBeCloseTo(full.guaranteedIrr!, 10);
      expect(result.nonGuaranteedIrr).toBeCloseTo(full.nonGuaranteedIrr!, 10);
      expect(result.guaranteedBreakEvenYear).toBe(full.guaranteedBreakEvenYear);
      expect(result.nonGuaranteedBreakEvenYear).toBe(full.nonGuaranteedBreakEvenYear);
    }

    // and still lands in the doc's confirmed ballpark, even at comparisonYears=1
    expect(oneYear.nonGuaranteedIrr!).toBeGreaterThan(0.04);
    expect(oneYear.nonGuaranteedIrr!).toBeLessThan(0.055);
  });
});
