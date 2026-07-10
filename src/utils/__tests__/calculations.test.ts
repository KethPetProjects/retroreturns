import { describe, it, expect } from 'vitest';
import {
  runBalanceTrack,
  arithmeticMean,
  computeMoneyWeightedReturn,
  runSimulation,
  validateSimulationInputs,
  BASELINE_FEE_PCT,
} from '../calculations';
import { getAnnualReturn } from '../../data/sp500Fallback';

describe('runBalanceTrack', () => {
  it('compounds a simple no-fee, no-contribution lump sum correctly', () => {
    const result = runBalanceTrack(1000, [0, 0], [0.1, 0.2], 0);
    // Year 1: 1000 * 1.1 = 1100. Year 2: 1100 * 1.2 = 1320.
    expect(result.endingBalances[0]).toBeCloseTo(1100, 6);
    expect(result.endingBalances[1]).toBeCloseTo(1320, 6);
  });

  it('adds contributions at the start of the year before applying that year\'s return', () => {
    const result = runBalanceTrack(0, [1000], [0.1], 0);
    // beginning balance = 0 + 1000 = 1000, grows by 10% -> 1100
    expect(result.beginningBalances[0]).toBe(1000);
    expect(result.endingBalances[0]).toBeCloseTo(1100, 6);
  });

  it('charges the fee as a % of beginning balance regardless of gain or loss', () => {
    const lossResult = runBalanceTrack(10000, [0], [-0.1], 0.01);
    // beginning = 10000, loss = -1000, fee = 100 (charged even though return is negative)
    expect(lossResult.feeAmounts[0]).toBeCloseTo(100, 6);
    expect(lossResult.endingBalances[0]).toBeCloseTo(10000 - 1000 - 100, 6);
  });

  it('lets a negative-return year reduce the balance before the next year compounds from it', () => {
    const result = runBalanceTrack(1000, [0, 0], [-0.5, 0.5], 0);
    expect(result.endingBalances[0]).toBeCloseTo(500, 6);
    // next year's contribution (0) + reduced balance compounds forward from 500
    expect(result.beginningBalances[1]).toBeCloseTo(500, 6);
    expect(result.endingBalances[1]).toBeCloseTo(750, 6);
  });

  it('throws if contributions and returns arrays have mismatched lengths', () => {
    expect(() => runBalanceTrack(0, [1, 2], [0.1], 0)).toThrow();
  });
});

describe('arithmeticMean', () => {
  it('computes the simple average of a return sequence', () => {
    expect(arithmeticMean([0.1, 0.2, -0.1])).toBeCloseTo(0.06666667, 6);
  });

  it('returns 0 for an empty array', () => {
    expect(arithmeticMean([])).toBe(0);
  });
});

describe('computeMoneyWeightedReturn', () => {
  it('matches simple CAGR for a lump sum with no contributions', () => {
    const result = computeMoneyWeightedReturn(1000, [0, 0, 0], 1331, 3);
    // 1000 growing at 10%/yr for 3 years = 1331
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(0.1, 4);
  });
});

describe('runSimulation (Section 10 acceptance criteria)', () => {
  const baseInputs = {
    startingYear: 1995,
    numberOfYears: 30,
    startingBalance: 10000,
    annualContribution: 6000,
    managementFeePct: 0.0003,
    taxRatePct: 0,
  };

  it('produces one row per simulated year using real historical data', () => {
    const result = runSimulation(baseInputs);
    expect(result.rows).toHaveLength(30);
    expect(result.rows[0].year).toBe(1995);
    expect(result.rows[29].year).toBe(2024);
  });

  it('populates price-only and total-return columns from the hardcoded dataset', () => {
    const result = runSimulation(baseInputs);
    const row1995 = result.rows[0];
    const expected = getAnnualReturn(1995)!;
    expect(row1995.priceReturn).toBeCloseTo(expected.priceReturn, 6);
    expect(row1995.totalReturn).toBeCloseTo(expected.totalReturn, 6);
  });

  it('compounds "My Actual Amount" using sequenced total returns with start-of-year contributions', () => {
    const result = runSimulation(baseInputs);
    const row1 = result.rows[0];
    const expectedBeg = 10000 + 6000;
    expect(row1.beginningBalance).toBeCloseTo(expectedBeg, 6);
    const expectedEnding =
      expectedBeg + expectedBeg * row1.totalReturn - expectedBeg * baseInputs.managementFeePct;
    expect(row1.actualBalance).toBeCloseTo(expectedEnding, 6);
  });

  it('uses the arithmetic mean of the actual return sequence as the flat average rate', () => {
    const result = runSimulation(baseInputs);
    const totalReturns = result.rows.map((r) => r.totalReturn);
    const expectedAvg = totalReturns.reduce((a, b) => a + b, 0) / totalReturns.length;
    expect(result.averageRateUsed).toBeCloseTo(expectedAvg, 10);
    expect(result.rows.every((r) => r.avgRateUsed === result.averageRateUsed)).toBe(true);
  });

  it('computes correct total contributed, final values, and dollar difference', () => {
    const result = runSimulation(baseInputs);
    expect(result.totalContributed).toBe(10000 + 6000 * 30);
    expect(result.finalActualValue).toBe(result.rows[29].actualBalance);
    expect(result.finalAverageValue).toBe(result.rows[29].averageBalance);
    expect(result.dollarDifference).toBeCloseTo(result.finalAverageValue - result.finalActualValue, 6);
  });

  it('uses money-weighted (XIRR) CAGR, not a naive balance/contributions ratio', () => {
    const result = runSimulation(baseInputs);
    const naiveRatioCagr =
      Math.pow(result.finalActualValue / result.totalContributed, 1 / 30) - 1;
    // The two methodologies should differ meaningfully for a 30-year contribution stream —
    // if they matched, we'd have accidentally reverted to the superseded simplified approach.
    expect(result.finalCagrActual).not.toBeNull();
    expect(Math.abs(result.finalCagrActual! - naiveRatioCagr)).toBeGreaterThan(0.001);
  });

  it('isolates the Fee Impact ($) by comparing against a 0.03% baseline-fee re-run', () => {
    const highFeeInputs = { ...baseInputs, managementFeePct: 0.01 };
    const result = runSimulation(highFeeInputs);

    // Manually re-run at baseline fee to confirm feeImpactDollars matches the definition exactly
    const baselineResult = runSimulation({ ...baseInputs, managementFeePct: BASELINE_FEE_PCT });
    const expectedImpact =
      baselineResult.rows[29].actualBalance - result.rows[29].actualBalance;

    expect(result.feeImpactDollars).toBeCloseTo(expectedImpact, 4);
    expect(result.feeImpactDollars).toBeGreaterThan(0); // higher fee costs real dollars vs. baseline
  });

  it('produces ~0 fee impact when the input fee equals the baseline fee', () => {
    const result = runSimulation(baseInputs); // already uses BASELINE_FEE_PCT
    expect(result.feeImpactDollars).toBeCloseTo(0, 6);
  });

  it('produces a negative fee impact (a savings, not a cost) when the input fee is below baseline', () => {
    // Bug: the raw number is correct (baseline - actual), but a naive UI display
    // showed this as a negative "cost", which reads backwards. The calculation
    // itself should still produce this negative value — the UI is responsible
    // for relabeling it as savings (see SummarySection.tsx).
    const lowFeeInputs = { ...baseInputs, managementFeePct: 0 };
    const result = runSimulation(lowFeeInputs);
    expect(result.feeImpactDollars).toBeLessThan(0);
  });

  it('applies tax as a single end-of-period haircut on both tracks', () => {
    const noTax = runSimulation(baseInputs);
    const withTax = runSimulation({ ...baseInputs, taxRatePct: 0.15 });
    expect(withTax.finalActualValue).toBeCloseTo(noTax.finalActualValue * 0.85, 4);
    expect(withTax.finalAverageValue).toBeCloseTo(noTax.finalAverageValue * 0.85, 4);
  });
});

describe('validateSimulationInputs', () => {
  it('flags starting year + years exceeding the current year', () => {
    const errors = validateSimulationInputs(
      { startingYear: 2020, numberOfYears: 20, startingBalance: 1000, annualContribution: 0 },
      2024,
    );
    expect(errors.some((e) => e.field === 'numberOfYears')).toBe(true);
  });

  it('flags starting balance and contribution both being $0', () => {
    const errors = validateSimulationInputs({
      startingYear: 2000,
      numberOfYears: 10,
      startingBalance: 0,
      annualContribution: 0,
    });
    expect(errors.some((e) => e.field === 'startingBalance')).toBe(true);
  });

  it('flags fee outside 0-2% and tax outside 0-50%', () => {
    const errors = validateSimulationInputs({
      startingYear: 2000,
      numberOfYears: 10,
      startingBalance: 1000,
      annualContribution: 0,
      managementFeePct: 0.05,
      taxRatePct: 0.9,
    });
    expect(errors.some((e) => e.field === 'managementFeePct')).toBe(true);
    expect(errors.some((e) => e.field === 'taxRatePct')).toBe(true);
  });

  it('passes for a valid input set', () => {
    const errors = validateSimulationInputs(
      {
        startingYear: 1995,
        numberOfYears: 30,
        startingBalance: 10000,
        annualContribution: 6000,
        managementFeePct: 0.0003,
        taxRatePct: 0,
      },
      2026,
    );
    expect(errors).toHaveLength(0);
  });
});
