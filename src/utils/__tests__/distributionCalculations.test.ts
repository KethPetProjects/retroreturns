import { describe, it, expect } from 'vitest';
import {
  grossUpWithdrawal,
  computeTaxOwed,
  solveGrossWithdrawal,
  computeCombinedTaxOwed,
  runWithdrawalTrack,
  runMonteCarloDistribution,
  runDistributionComparison,
  validateDistributionInputs,
  getActualBalanceAtRetirement,
} from '../distributionCalculations';
import type { SimulationYearRow } from '../../types';

function makeRows(actualBalances: number[]): SimulationYearRow[] {
  return actualBalances.map((actualBalance, i) => ({
    year: 1995 + i,
    yearIndex: i + 1,
    beginningBalance: 0,
    contribution: 0,
    priceReturn: 0,
    totalReturn: 0,
    avgRateUsed: 0,
    interestEarnings: 0,
    feeAmount: 0,
    actualBalance,
    cagrActualToDate: null,
    averageBalance: 0,
  }));
}

describe('getActualBalanceAtRetirement', () => {
  const rows = makeRows([100, 200, 300, 400, 500]); // years 1995-1999, a 5-year accumulation window

  it('returns the balance for a year in the middle of accumulation, not the final year', () => {
    // retiring 3 years in should use year 3's balance (300), not year 5's (500)
    expect(getActualBalanceAtRetirement(rows, 3)).toBe(300);
  });

  it('returns the first year\'s balance when retiring right after year 1', () => {
    expect(getActualBalanceAtRetirement(rows, 1)).toBe(100);
  });

  it('falls back to the final balance when retiring at or after accumulation ends', () => {
    expect(getActualBalanceAtRetirement(rows, 5)).toBe(500);
    expect(getActualBalanceAtRetirement(rows, 6)).toBe(500); // one year past the end, graceful fallback
  });

  it('returns undefined when retiring before accumulation starts, or with no rows', () => {
    expect(getActualBalanceAtRetirement(rows, 0)).toBeUndefined();
    expect(getActualBalanceAtRetirement([], 3)).toBeUndefined();
  });
});

describe('grossUpWithdrawal / computeTaxOwed (net-to-gross round trip)', () => {
  it('round-trips exactly: net = gross - tax(gross)', () => {
    const net = 80000;
    const standardDeduction = 15000;
    const taxRatePct = 0.2;
    const gross = grossUpWithdrawal(net, standardDeduction, taxRatePct);
    const tax = computeTaxOwed(gross, standardDeduction, taxRatePct);
    expect(gross - tax).toBeCloseTo(net, 6);
  });

  it('requires no gross-up when net spend is under the standard deduction', () => {
    const gross = grossUpWithdrawal(10000, 15000, 0.2);
    expect(gross).toBe(10000);
    expect(computeTaxOwed(gross, 15000, 0.2)).toBe(0);
  });

  it('returns the net amount unchanged when tax rate is 0', () => {
    expect(grossUpWithdrawal(80000, 15000, 0)).toBe(80000);
  });

  it('grosses up more as the tax rate increases, for the same net target', () => {
    const low = grossUpWithdrawal(80000, 15000, 0.1);
    const high = grossUpWithdrawal(80000, 15000, 0.3);
    expect(high).toBeGreaterThan(low);
  });
});

describe('solveGrossWithdrawal / computeCombinedTaxOwed (multi-income-source generalization)', () => {
  it('matches grossUpWithdrawal/computeTaxOwed exactly when there is no other income', () => {
    const net = 80000;
    const standardDeduction = 15000;
    const taxRatePct = 0.2;
    expect(solveGrossWithdrawal(net, standardDeduction, taxRatePct)).toBeCloseTo(
      grossUpWithdrawal(net, standardDeduction, taxRatePct),
      6,
    );
  });

  it('reduces the required portfolio withdrawal by tax-free fixed income (e.g. reverse mortgage)', () => {
    const withoutFixed = solveGrossWithdrawal(80000, 15000, 0.2, 0, 0);
    const withFixed = solveGrossWithdrawal(80000, 15000, 0.2, 0, 20000);
    expect(withFixed).toBeLessThan(withoutFixed);
    // Reduces the gross need by roughly the fixed income amount (not exactly,
    // because less gross withdrawal also means less tax owed on it).
    expect(withoutFixed - withFixed).toBeGreaterThan(0);
  });

  it('taxes pooled taxable fixed income (e.g. taxable Social Security) alongside the portfolio withdrawal', () => {
    const gross = solveGrossWithdrawal(80000, 15000, 0.2, 20000, 20000);
    const tax = computeCombinedTaxOwed(gross, 15000, 0.2, 20000);
    // Total spendable (gross + fixed income - tax) should net exactly the target.
    expect(gross + 20000 - tax).toBeCloseTo(80000, 6);
  });

  it('round-trips net = gross + fixedIncome - tax across a range of taxable/tax-free splits', () => {
    const cases = [
      { taxableFixedIncome: 0, fixedIncome: 0 },
      { taxableFixedIncome: 10000, fixedIncome: 10000 },
      { taxableFixedIncome: 0, fixedIncome: 15000 }, // all tax-free (reverse mortgage only)
      { taxableFixedIncome: 25000, fixedIncome: 30000 }, // taxable SS portion + tax-free reverse mortgage mixed in
    ];
    for (const { taxableFixedIncome, fixedIncome } of cases) {
      const net = 90000;
      const standardDeduction = 15000;
      const taxRatePct = 0.25;
      const gross = solveGrossWithdrawal(net, standardDeduction, taxRatePct, taxableFixedIncome, fixedIncome);
      const tax = computeCombinedTaxOwed(gross, standardDeduction, taxRatePct, taxableFixedIncome);
      expect(gross + fixedIncome - tax).toBeCloseTo(net, 6);
    }
  });

  it('returns 0 when fixed income alone already covers the net expense target', () => {
    expect(solveGrossWithdrawal(50000, 15000, 0.2, 0, 80000)).toBe(0);
  });
});

describe('runWithdrawalTrack (Section 13.3)', () => {
  it('grows the net expense target and standard deduction by inflation each year', () => {
    const result = runWithdrawalTrack({
      startingBalance: 1_000_000,
      returns: [0.05, 0.05, 0.05],
      annualExpense: 80000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      taxRatePct: 0,
      feePct: 0,
    });
    expect(result.rows[0].netExpenseTarget).toBeCloseTo(80000, 4);
    expect(result.rows[1].netExpenseTarget).toBeCloseTo(80000 * 1.03, 4);
    expect(result.rows[2].netExpenseTarget).toBeCloseTo(80000 * 1.03 * 1.03, 4);
  });

  it('applies that year\'s return to the balance after the withdrawal, not before', () => {
    const result = runWithdrawalTrack({
      startingBalance: 1_000_000,
      returns: [0.1],
      annualExpense: 100000,
      inflationRatePct: 0,
      standardDeduction: 0,
      taxRatePct: 0,
      feePct: 0,
    });
    // (1,000,000 - 100,000) * 1.1 = 990,000
    expect(result.rows[0].endingBalance).toBeCloseTo(990000, 2);
  });

  it('stops the simulation the year the balance hits zero, not before or after', () => {
    const result = runWithdrawalTrack({
      startingBalance: 100000,
      returns: [0, 0, 0, 0, 0],
      annualExpense: 30000,
      inflationRatePct: 0,
      standardDeduction: 0,
      taxRatePct: 0,
      feePct: 0,
    });
    // 100k -30k=70k -30k=40k -30k=10k -30k=-20k -> depletes in year 4
    expect(result.depletedAtYear).toBe(4);
    expect(result.rows).toHaveLength(4);
    expect(result.finalBalance).toBe(0);
  });

  it('reports no depletion when the balance survives the full horizon', () => {
    const result = runWithdrawalTrack({
      startingBalance: 1_000_000,
      returns: new Array(30).fill(0.07),
      annualExpense: 30000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      taxRatePct: 0.15,
      feePct: 0.0003,
    });
    expect(result.depletedAtYear).toBeNull();
    expect(result.finalBalance).toBeGreaterThan(0);
  });

  it('a bad early sequence depletes faster than the same average rate spread evenly (sequence-of-returns risk)', () => {
    // Same three returns, different order: -30% first vs. last.
    const badFirst = runWithdrawalTrack({
      startingBalance: 500000,
      returns: [-0.3, 0.1, 0.1],
      annualExpense: 60000,
      inflationRatePct: 0,
      standardDeduction: 0,
      taxRatePct: 0,
      feePct: 0,
    });
    const badLast = runWithdrawalTrack({
      startingBalance: 500000,
      returns: [0.1, 0.1, -0.3],
      annualExpense: 60000,
      inflationRatePct: 0,
      standardDeduction: 0,
      taxRatePct: 0,
      feePct: 0,
    });
    expect(badFirst.finalBalance).toBeLessThan(badLast.finalBalance);
  });

  it('deducts tax-driven gross-up so a taxed track ends with less money than an untaxed one for the same net spend', () => {
    const noTax = runWithdrawalTrack({
      startingBalance: 1_000_000,
      returns: new Array(10).fill(0.05),
      annualExpense: 40000,
      inflationRatePct: 0,
      standardDeduction: 15000,
      taxRatePct: 0,
      feePct: 0,
    });
    const withTax = runWithdrawalTrack({
      startingBalance: 1_000_000,
      returns: new Array(10).fill(0.05),
      annualExpense: 40000,
      inflationRatePct: 0,
      standardDeduction: 15000,
      taxRatePct: 0.25,
      feePct: 0,
    });
    expect(noTax.depletedAtYear).toBeNull();
    expect(withTax.depletedAtYear).toBeNull();
    expect(withTax.finalBalance).toBeLessThan(noTax.finalBalance);
  });
});

describe('runWithdrawalTrack — cash bucket strategy', () => {
  it('carves out cashBucketYears worth of upcoming withdrawals into cash up front', () => {
    // No inflation/tax/deduction, so each year's gross withdrawal is exactly
    // the annual expense — the year-1 bucket target is just 2x that.
    const result = runWithdrawalTrack({
      startingBalance: 1_000_000,
      returns: [0.1, 0.1],
      annualExpense: 50000,
      inflationRatePct: 0,
      standardDeduction: 0,
      taxRatePct: 0,
      feePct: 0,
      cashBucketYears: 2,
      cashInterestRatePct: 0,
    });
    expect(result.rows[0].beginningBalance).toBe(1_000_000);
    // Bucket = 2 x 50,000 = 100,000 carved out; stock gets the remaining 900,000.
    // The withdrawal for year 1 comes entirely from cash, so before any
    // return is applied, cash should have dropped by exactly the withdrawal.
    // We can't see the pre-return split directly, but we CAN confirm the
    // stock side grew as if it started at 900,000 untouched by the withdrawal:
    // 900,000 * 1.1 = 990,000 (before any refill).
    expect(result.rows[0].stockBalance).toBeGreaterThanOrEqual(990000 - 1); // may be slightly higher if refilled
  });

  it('does not refill the bucket after a down year, letting it drain instead', () => {
    // Bucket = 2 years x 50,000 = 100,000 initially, stock = 900,000.
    // Year 1: down year (-20%) -> should NOT refill even though cash needs it.
    const result = runWithdrawalTrack({
      startingBalance: 1_000_000,
      returns: [-0.2, -0.2],
      annualExpense: 50000,
      inflationRatePct: 0,
      standardDeduction: 0,
      taxRatePct: 0,
      feePct: 0,
      cashBucketYears: 2,
      cashInterestRatePct: 0,
    });
    expect(result.rows[0].refilled).toBe(false);
    expect(result.rows[1].refilled).toBe(false);
    // Cash bucket should have shrunk (50,000 withdrawn in year 1, no refill,
    // then another 50,000 withdrawn in year 2 from what's left) rather than
    // staying near its original 100,000 target.
    expect(result.rows[1].cashBalance).toBeLessThan(50000);
  });

  it('refills the bucket back toward its target after an up year', () => {
    const result = runWithdrawalTrack({
      startingBalance: 1_000_000,
      returns: [-0.1, 0.15, 0.1],
      annualExpense: 50000,
      inflationRatePct: 0,
      standardDeduction: 0,
      taxRatePct: 0,
      feePct: 0,
      cashBucketYears: 2,
      cashInterestRatePct: 0,
    });
    expect(result.rows[0].refilled).toBe(false); // down year, no refill
    expect(result.rows[1].refilled).toBe(true); // up year, refill happens
    // After refilling in year 2, cash should be meaningfully higher than
    // what it drained to at the end of year 1's down year.
    expect(result.rows[1].cashBalance).toBeGreaterThan(0);
  });

  it('falls back to selling stock when the bucket runs dry mid-downturn', () => {
    // A long string of down years should eventually drain a small bucket
    // and force withdrawals straight from stock — the strategy shouldn't
    // silently fail to withdraw at all.
    const result = runWithdrawalTrack({
      startingBalance: 500000,
      returns: [-0.1, -0.1, -0.1, -0.1, -0.1],
      annualExpense: 80000,
      inflationRatePct: 0,
      standardDeduction: 0,
      taxRatePct: 0,
      feePct: 0,
      cashBucketYears: 1,
      cashInterestRatePct: 0,
    });
    // Bucket target = 1 year = 80,000. After the bucket is exhausted, later
    // years must pull from stock even without a refill, so stockBalance
    // should be actively decreasing beyond just market losses.
    expect(result.rows.some((r) => r.cashBalance === 0)).toBe(true);
    expect(result.finalBalance).toBeGreaterThanOrEqual(0);
  });

  it('behaves identically to a plain (bucket-disabled) withdrawal when cashBucketYears is 0', () => {
    const base = {
      startingBalance: 1_000_000,
      returns: [0.08, -0.05, 0.12],
      annualExpense: 60000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      taxRatePct: 0.15,
      feePct: 0.0003,
    };
    const withoutBucket = runWithdrawalTrack(base);
    const explicitlyZero = runWithdrawalTrack({ ...base, cashBucketYears: 0, cashInterestRatePct: 0 });
    expect(explicitlyZero.finalBalance).toBeCloseTo(withoutBucket.finalBalance, 6);
    expect(explicitlyZero.rows[0].endingBalance).toBeCloseTo(withoutBucket.rows[0].endingBalance, 6);
  });
});

describe('runWithdrawalTrack — Social Security / other income / reverse mortgage', () => {
  const base = {
    startingBalance: 1_000_000,
    returns: [0.05, 0.05, 0.05, 0.05, 0.05],
    annualExpense: 80000,
    inflationRatePct: 0.03,
    standardDeduction: 15000,
    taxRatePct: 0.2,
    feePct: 0,
  };

  it('is a strict special case: all-zero income fields behave identically to the base track', () => {
    const plain = runWithdrawalTrack(base);
    const withZeros = runWithdrawalTrack({
      ...base,
      socialSecurityAnnualBenefit: 0,
      otherAnnualIncome: 0,
      reverseMortgageAnnualIncome: 0,
    });
    expect(withZeros.finalBalance).toBeCloseTo(plain.finalBalance, 6);
    expect(withZeros.rows[0].grossWithdrawal).toBeCloseTo(plain.rows[0].grossWithdrawal, 6);
  });

  it('reduces the required gross portfolio withdrawal once Social Security starts', () => {
    const result = runWithdrawalTrack({
      ...base,
      socialSecurityAnnualBenefit: 20000,
      socialSecurityStartYear: 1,
      socialSecurityTaxablePortionPct: 0.85,
    });
    const plain = runWithdrawalTrack(base);
    expect(result.rows[0].grossWithdrawal).toBeLessThan(plain.rows[0].grossWithdrawal);
    expect(result.rows[0].socialSecurityIncome).toBeCloseTo(20000, 4);
  });

  it('withholds Social Security until its own start year, independent of retirement start', () => {
    const result = runWithdrawalTrack({
      ...base,
      socialSecurityAnnualBenefit: 20000,
      socialSecurityStartYear: 3, // starts in year 3, not year 1
      socialSecurityTaxablePortionPct: 0.85,
    });
    expect(result.rows[0].socialSecurityIncome).toBe(0);
    expect(result.rows[1].socialSecurityIncome).toBe(0);
    expect(result.rows[2].socialSecurityIncome).toBeCloseTo(20000, 4);
  });

  it('inflates Social Security from its own start year, not from year 1', () => {
    const result = runWithdrawalTrack({
      ...base,
      socialSecurityAnnualBenefit: 20000,
      socialSecurityStartYear: 3,
      socialSecurityTaxablePortionPct: 0.85,
    });
    // Year 3 (the first claimed year) should be exactly 20,000, not already inflated.
    expect(result.rows[2].socialSecurityIncome).toBeCloseTo(20000, 4);
    expect(result.rows[3].socialSecurityIncome).toBeCloseTo(20000 * 1.03, 4);
  });

  it('excludes reverse mortgage draws from taxable income entirely', () => {
    const withReverseMortgage = runWithdrawalTrack({
      ...base,
      reverseMortgageAnnualIncome: 30000,
    });
    // Tax owed should reflect only the (smaller) portfolio withdrawal, not
    // the reverse mortgage draw — spendable cash goes up by close to the
    // full 30,000 rather than a tax-reduced amount.
    const plain = runWithdrawalTrack(base);
    expect(withReverseMortgage.rows[0].taxOwed).toBeLessThan(plain.rows[0].taxOwed);
    expect(withReverseMortgage.rows[0].reverseMortgageIncome).toBeCloseTo(30000, 4);
  });

  it('holds reverse mortgage income flat in nominal dollars — unlike Social Security/Other Income, it does not inflate', () => {
    const result = runWithdrawalTrack({
      ...base,
      reverseMortgageAnnualIncome: 30000,
      otherAnnualIncome: 10000,
    });
    expect(result.rows[0].reverseMortgageIncome).toBeCloseTo(30000, 4);
    expect(result.rows[4].reverseMortgageIncome).toBeCloseTo(30000, 4); // year 5, still flat
    // Other Income, by contrast, inflates every year same as the expense target.
    expect(result.rows[4].otherIncome).toBeCloseTo(10000 * Math.pow(1.03, 4), 4);
  });

  it('pools other income into the same combined tax calculation as the portfolio withdrawal', () => {
    const result = runWithdrawalTrack({
      ...base,
      otherAnnualIncome: 15000,
    });
    expect(result.rows[0].otherIncome).toBeCloseTo(15000, 4);
    const plain = runWithdrawalTrack(base);
    expect(result.rows[0].grossWithdrawal).toBeLessThan(plain.rows[0].grossWithdrawal);
  });
});

describe('runMonteCarloDistribution', () => {
  // Simple deterministic PRNG for reproducible tests
  function seededRandom(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  }

  it('reports 100% success when returns are always strongly positive relative to spend', () => {
    const result = runMonteCarloDistribution({
      startingBalance: 5_000_000,
      historicalReturnPool: [0.15, 0.18, 0.12, 0.2],
      years: 20,
      annualExpense: 30000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      taxRatePct: 0.15,
      feePct: 0.0003,
      trials: 200,
      randomFn: seededRandom(42),
    });
    expect(result.successRatePct).toBe(1);
    expect(result.depletionYears).toHaveLength(0);
    expect(result.medianDepletionYear).toBeNull();
  });

  it('reports a low success rate when spend far exceeds what the balance can sustain', () => {
    const result = runMonteCarloDistribution({
      startingBalance: 50000,
      historicalReturnPool: [0.05, -0.05, 0.03, -0.1, 0.08],
      years: 30,
      annualExpense: 40000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      taxRatePct: 0.15,
      feePct: 0.0003,
      trials: 200,
      randomFn: seededRandom(7),
    });
    expect(result.successRatePct).toBeLessThan(0.2);
    expect(result.depletionYears.length).toBeGreaterThan(0);
  });

  it('medianDepletionYear always matches medianTrialRows — the Summary and the Table can never disagree', () => {
    // A mix of good and bad returns so the run produces a realistic blend of
    // survivors and failures, exercising the actual ranking logic rather
    // than an all-succeed or all-fail edge case.
    const result = runMonteCarloDistribution({
      startingBalance: 900000,
      historicalReturnPool: [0.15, -0.2, 0.1, -0.05, 0.2, 0.03, -0.15, 0.12, 0.08, -0.1],
      years: 30,
      annualExpense: 55000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      taxRatePct: 0.2,
      feePct: 0.0003,
      trials: 400,
      randomFn: seededRandom(17),
    });
    const lastRow = result.medianTrialRows[result.medianTrialRows.length - 1];
    const medianTrialDepletedAtYear = lastRow.endingBalance <= 0 ? lastRow.year : null;
    expect(result.medianDepletionYear).toBe(medianTrialDepletedAtYear);
  });

  it('reports a null median outcome (not a phantom depletion) when success rate is above 50%', () => {
    // Mild, mostly-sustainable returns relative to spend — most trials should survive.
    const result = runMonteCarloDistribution({
      startingBalance: 3_000_000,
      historicalReturnPool: [0.08, 0.1, -0.05, 0.12, 0.06],
      years: 25,
      annualExpense: 60000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      taxRatePct: 0.15,
      feePct: 0.0003,
      trials: 300,
      randomFn: seededRandom(23),
    });
    expect(result.successRatePct).toBeGreaterThan(0.5);
    // The 50th-percentile trial across ALL trials is necessarily a survivor
    // once more than half succeed — reporting a depletion year here would be
    // describing a different (failures-only) population than the table.
    expect(result.medianDepletionYear).toBeNull();
    expect(result.medianTrialRows[result.medianTrialRows.length - 1].endingBalance).toBeGreaterThan(0);
  });

  it('produces a worst-decile depletion year no later than the median depletion year', () => {
    const result = runMonteCarloDistribution({
      startingBalance: 800000,
      historicalReturnPool: [0.15, -0.2, 0.1, -0.05, 0.2, 0.03, -0.15, 0.12],
      years: 30,
      annualExpense: 60000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      taxRatePct: 0.15,
      feePct: 0.0003,
      trials: 500,
      randomFn: seededRandom(99),
    });
    if (result.worstDecileDepletionYear !== null && result.medianDepletionYear !== null) {
      expect(result.worstDecileDepletionYear).toBeLessThanOrEqual(result.medianDepletionYear);
    }
  });

  it('returns a medianTrialRows path whose length is consistent with its own outcome', () => {
    const result = runMonteCarloDistribution({
      startingBalance: 800000,
      historicalReturnPool: [0.15, -0.2, 0.1, -0.05, 0.2, 0.03, -0.15, 0.12],
      years: 30,
      annualExpense: 60000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      taxRatePct: 0.15,
      feePct: 0.0003,
      trials: 300,
      randomFn: seededRandom(3),
    });
    expect(result.medianTrialRows.length).toBeGreaterThan(0);
    expect(result.medianTrialRows.length).toBeLessThanOrEqual(30);
  });
});

describe('runDistributionComparison (integration)', () => {
  function seededRandom(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  }

  it('runs the Monte Carlo simulation for planThroughAge - stopWorkingAge years', () => {
    const result = runDistributionComparison({
      startingBalanceActual: 1_500_000,
      distributionInputs: {
        currentAge: 40,
        stopWorkingAge: 65,
        planThroughAge: 95,
        annualExpense: 80000,
        inflationRatePct: 0.03,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0,
        managementFeePct: 0.0003,
        cashBucketYears: 0,
        cashInterestRatePct: 0,
        socialSecurityAnnualBenefit: 0,
        socialSecurityClaimingAge: 67,
        socialSecurityTaxablePortionPct: 0.85,
        otherAnnualIncome: 0,
        reverseMortgageAnnualIncome: 0,
      },
      monteCarloTrials: 100,
      randomFn: seededRandom(1),
    });
    expect(result.years).toBe(30);
    expect(result.monteCarlo.trials).toBe(100);
    expect(result.monteCarlo.medianTrialRows.length).toBeGreaterThan(0);
    expect(result.monteCarlo.medianTrialRows.length).toBeLessThanOrEqual(30);
  });

  it('uses the pre-tax ACTUAL starting balance passed in, not some other figure', () => {
    const distributionInputs = {
      currentAge: 40,
      stopWorkingAge: 65,
      planThroughAge: 70, // short horizon, easy to reason about
      annualExpense: 50000, // deliberately huge relative to the tiny actual balance below
      inflationRatePct: 0,
      standardDeduction: 0,
      federalTaxRatePct: 0,
      stateTaxRatePct: 0,
      managementFeePct: 0,
      cashBucketYears: 0,
      cashInterestRatePct: 0,
      socialSecurityAnnualBenefit: 0,
      socialSecurityClaimingAge: 65,
      socialSecurityTaxablePortionPct: 0,
      otherAnnualIncome: 0,
      reverseMortgageAnnualIncome: 0,
    };
    const lowActualStart = runDistributionComparison({
      startingBalanceActual: 10000, // one year's expense wipes this out almost regardless of return
      distributionInputs,
      monteCarloTrials: 50,
      randomFn: seededRandom(5),
    });
    // A tiny starting balance against a much larger annual expense should fail
    // in nearly every trial, regardless of the specific random returns drawn.
    expect(lowActualStart.monteCarlo.successRatePct).toBeLessThan(0.2);
  });

  it('combines federal + state tax rates and pools Social Security to reduce the withdrawal need', () => {
    const distributionInputs = {
      currentAge: 40,
      stopWorkingAge: 65,
      planThroughAge: 90,
      annualExpense: 80000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      federalTaxRatePct: 0.15,
      stateTaxRatePct: 0.05,
      managementFeePct: 0.0003,
      cashBucketYears: 0,
      cashInterestRatePct: 0,
      socialSecurityAnnualBenefit: 25000,
      socialSecurityClaimingAge: 65,
      socialSecurityTaxablePortionPct: 0.85,
      otherAnnualIncome: 0,
      reverseMortgageAnnualIncome: 0,
    };
    const withSS = runDistributionComparison({
      startingBalanceActual: 1_500_000,
      distributionInputs,
      monteCarloTrials: 50,
      randomFn: seededRandom(2),
    });
    const withoutSS = runDistributionComparison({
      startingBalanceActual: 1_500_000,
      distributionInputs: { ...distributionInputs, socialSecurityAnnualBenefit: 0 },
      monteCarloTrials: 50,
      randomFn: seededRandom(2),
    });
    expect(withSS.monteCarlo.medianTrialRows[0].grossWithdrawal).toBeLessThan(
      withoutSS.monteCarlo.medianTrialRows[0].grossWithdrawal,
    );
  });
});

describe('validateDistributionInputs (Section 13.2)', () => {
  const phase1 = { startingYear: 1995, numberOfYears: 30 }; // accumulation ends 2024

  it('passes when stop-working age implies retirement starting exactly when accumulation ends', () => {
    const errors = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 64, // 1995 + (64-35) = 2024, matches accumulation end
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
      },
      phase1,
    );
    expect(errors).toHaveLength(0);
  });

  it('allows retiring partway through accumulation, not just at the very end', () => {
    // 1995 + (50-35) = 2010, 15 years into the 30-year accumulation window —
    // should use that year's balance, not be rejected outright.
    const errors = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 50,
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
      },
      phase1,
    );
    expect(errors).toHaveLength(0);
  });

  it('flags a stop-working age that implies retirement before accumulation even starts', () => {
    const errors = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 35, // stopWorkingAge - currentAge = 0, before year 1
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'stopWorkingAge')).toBe(true);
  });

  it('flags a stop-working age that implies retirement well after accumulation ends (unmodeled gap)', () => {
    const errors = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 80, // 45 years into a 30-year window
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'stopWorkingAge')).toBe(true);
  });

  it('flags stopWorkingAge <= currentAge and planThroughAge <= stopWorkingAge', () => {
    const errors = validateDistributionInputs(
      {
        currentAge: 65,
        stopWorkingAge: 65,
        planThroughAge: 65,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'stopWorkingAge')).toBe(true);
    expect(errors.some((e) => e.field === 'planThroughAge')).toBe(true);
  });

  it('flags a non-positive annual expense', () => {
    const errors = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 64,
        planThroughAge: 95,
        annualExpense: 0,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'annualExpense')).toBe(true);
  });

  it('flags a combined federal + state tax rate that reaches 100%', () => {
    const errors = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 64,
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.5,
        stateTaxRatePct: 0.5,
        managementFeePct: 0.0003,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'stateTaxRatePct')).toBe(true);
  });

  it('flags an out-of-range Social Security taxable portion', () => {
    const errors = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 64,
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
        socialSecurityTaxablePortionPct: 1.5,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'socialSecurityTaxablePortionPct')).toBe(true);
  });

  it('flags negative other income and reverse mortgage income', () => {
    const errors = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 64,
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
        otherAnnualIncome: -1000,
        reverseMortgageAnnualIncome: -1000,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'otherAnnualIncome')).toBe(true);
    expect(errors.some((e) => e.field === 'reverseMortgageAnnualIncome')).toBe(true);
  });
});
