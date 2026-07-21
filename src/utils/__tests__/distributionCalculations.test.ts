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
  rmdDivisorForAge,
  rmdStartAgeForBirthYear,
  sampleBlockBootstrapReturns,
  historicalReturnPoolFromYear,
  HISTORICAL_TOTAL_RETURN_POOL,
} from '../distributionCalculations';
import { SP500_DATA_MIN_YEAR, SP500_DATA_MAX_YEAR } from '../../data/sp500Fallback';
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

  it('rothPortfolioPct = 0 is a strict special case: identical to the no-Roth formula', () => {
    const withoutRoth = solveGrossWithdrawal(80000, 15000, 0.2, 10000, 10000);
    const explicitZeroRoth = solveGrossWithdrawal(80000, 15000, 0.2, 10000, 10000, 0);
    expect(explicitZeroRoth).toBeCloseTo(withoutRoth, 8);
  });

  it('a larger Roth share reduces the required gross withdrawal for the same net spend', () => {
    const noRoth = solveGrossWithdrawal(80000, 15000, 0.2, 0, 0, 0);
    const halfRoth = solveGrossWithdrawal(80000, 15000, 0.2, 0, 0, 0.5);
    const allRoth = solveGrossWithdrawal(80000, 15000, 0.2, 0, 0, 1);
    expect(halfRoth).toBeLessThan(noRoth);
    expect(allRoth).toBeLessThan(halfRoth);
    // 100% Roth means zero tax ever applies — gross withdrawal exactly equals net need.
    expect(allRoth).toBeCloseTo(80000, 6);
  });

  it('round-trips net = gross - tax(gross, rothPct) across a range of Roth percentages', () => {
    for (const rothPortfolioPct of [0, 0.25, 0.5, 0.75, 1]) {
      const net = 90000;
      const standardDeduction = 15000;
      const taxRatePct = 0.25;
      const gross = solveGrossWithdrawal(net, standardDeduction, taxRatePct, 0, 0, rothPortfolioPct);
      const tax = computeCombinedTaxOwed(gross, standardDeduction, taxRatePct, 0, rothPortfolioPct);
      expect(gross - tax).toBeCloseTo(net, 6);
    }
  });

  it('combines correctly with pooled taxable fixed income — only the portfolio withdrawal gets the Roth exclusion', () => {
    const gross = solveGrossWithdrawal(80000, 15000, 0.2, 20000, 20000, 0.5);
    const tax = computeCombinedTaxOwed(gross, 15000, 0.2, 20000, 0.5);
    // Total spendable (gross + fixed income - tax) should still net exactly the target,
    // even though only half of gross (not the fixed income) is tax-free.
    expect(gross + 20000 - tax).toBeCloseTo(80000, 6);
  });
});

describe('rmdDivisorForAge / rmdStartAgeForBirthYear (SECURE 2.0 / IRS Uniform Lifetime Table)', () => {
  it('matches published IRS Uniform Lifetime Table divisors at spot-check ages', () => {
    expect(rmdDivisorForAge(73)).toBe(26.5);
    expect(rmdDivisorForAge(75)).toBe(24.6);
    expect(rmdDivisorForAge(90)).toBe(12.2);
    expect(rmdDivisorForAge(100)).toBe(6.4);
  });

  it('clamps ages at or above 120 to the final published divisor (2.0)', () => {
    expect(rmdDivisorForAge(120)).toBe(2.0);
    expect(rmdDivisorForAge(130)).toBe(2.0);
  });

  it('divisor shrinks (required withdrawal % rises) as age increases', () => {
    expect(rmdDivisorForAge(80)).toBeLessThan(rmdDivisorForAge(73));
    expect(rmdDivisorForAge(95)).toBeLessThan(rmdDivisorForAge(80));
  });

  it('applies SECURE 2.0\'s birth-year split: age 73 for born 1951-1959, age 75 for born 1960+', () => {
    expect(rmdStartAgeForBirthYear(1955)).toBe(73);
    expect(rmdStartAgeForBirthYear(1959)).toBe(73);
    expect(rmdStartAgeForBirthYear(1960)).toBe(75);
    expect(rmdStartAgeForBirthYear(1990)).toBe(75);
  });
});

describe('sampleBlockBootstrapReturns', () => {
  function seededRandom(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  }

  it('returns exactly totalYears values', () => {
    const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const result = sampleBlockBootstrapReturns(pool, 17, seededRandom(1), 5);
    expect(result).toHaveLength(17);
  });

  it('preserves real contiguous order within each block', () => {
    const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    // A fake randomFn returning a fixed sequence of "random" values so the
    // chosen start indices are deterministic and easy to hand-verify.
    const fixedDraws = [0.05, 0.85]; // with maxStartIndex=5 (pool 10, block 5): floor(0.05*6)=0, floor(0.85*6)=5
    let i = 0;
    const fakeRandom = () => fixedDraws[i++ % fixedDraws.length];
    const result = sampleBlockBootstrapReturns(pool, 10, fakeRandom, 5);
    // First block starts at index 0: [0,1,2,3,4]. Second block starts at index 5: [5,6,7,8,9].
    expect(result).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('truncates the final block when totalYears is not a multiple of blockLengthYears', () => {
    const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const result = sampleBlockBootstrapReturns(pool, 7, seededRandom(2), 5);
    expect(result).toHaveLength(7);
  });

  it('degenerates gracefully when blockLengthYears exceeds the pool length', () => {
    const pool = [1, 2, 3];
    const result = sampleBlockBootstrapReturns(pool, 6, seededRandom(3), 10);
    expect(result).toHaveLength(6);
    // Every value must still come from the real pool — no undefined/NaN.
    result.forEach((r) => expect(pool).toContain(r));
  });

  it('narrows the simulated 30-year CAGR range toward what real historical 30-year windows actually produced, unlike independent single-year sampling', () => {
    // Real rolling 30-year CAGR windows from this project's own historical
    // pool never exceed ~13.6% (verified separately) — independent
    // single-year resampling was shown to reach ~24% for some trials.
    // Block bootstrap (5-year blocks) should pull far-outlier trials back in.
    let seed = 7;
    const randomFn = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const trials = 500;
    const cagrs: number[] = [];
    for (let t = 0; t < trials; t++) {
      const returns = sampleBlockBootstrapReturns(HISTORICAL_TOTAL_RETURN_POOL, 30, randomFn, 5);
      const compounded = returns.reduce((acc, r) => acc * (1 + r), 1);
      cagrs.push(Math.pow(compounded, 1 / 30) - 1);
    }
    const maxCagr = Math.max(...cagrs);
    // Real 30-year windows topped out around 13.6% — block bootstrap should
    // stay well short of independent-sampling's observed ~24% max, even if
    // it doesn't fully match the tighter real-history bound.
    expect(maxCagr).toBeLessThan(0.21);
  });
});

describe('historicalReturnPoolFromYear', () => {
  it('returns the full pool when given the dataset\'s earliest year', () => {
    const pool = historicalReturnPoolFromYear(SP500_DATA_MIN_YEAR);
    expect(pool).toHaveLength(HISTORICAL_TOTAL_RETURN_POOL.length);
  });

  it('excludes years before the given start year', () => {
    const fullPool = historicalReturnPoolFromYear(SP500_DATA_MIN_YEAR);
    const restrictedPool = historicalReturnPoolFromYear(1960);
    expect(restrictedPool.length).toBeLessThan(fullPool.length);
    expect(restrictedPool.length).toBe(SP500_DATA_MAX_YEAR - 1960 + 1);
  });

  it('includes the boundary start year itself', () => {
    const poolFrom2020 = historicalReturnPoolFromYear(2020);
    expect(poolFrom2020.length).toBe(SP500_DATA_MAX_YEAR - 2020 + 1);
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

  it('adds no Long-Term Care cost before its start year', () => {
    const result = runWithdrawalTrack({
      ...base,
      longTermCareAnnualCost: 40000,
      longTermCareStartYear: 3,
    });
    expect(result.rows[0].longTermCareCost).toBe(0);
    expect(result.rows[1].longTermCareCost).toBe(0);
    expect(result.rows[0].grossWithdrawal).toBeCloseTo(runWithdrawalTrack(base).rows[0].grossWithdrawal, 4);
  });

  it('adds Long-Term Care as extra SPENDING (increases the withdrawal need) starting at its own start year', () => {
    const result = runWithdrawalTrack({
      ...base,
      longTermCareAnnualCost: 40000,
      longTermCareStartYear: 3,
    });
    const plain = runWithdrawalTrack(base);
    expect(result.rows[2].longTermCareCost).toBeCloseTo(40000, 4);
    // Unlike income sources, LTC cost INCREASES the required gross withdrawal.
    expect(result.rows[2].grossWithdrawal).toBeGreaterThan(plain.rows[2].grossWithdrawal);
  });

  it('inflates Long-Term Care cost at its own (higher) rate, independent of the general inflation rate', () => {
    const result = runWithdrawalTrack({
      ...base,
      inflationRatePct: 0.03,
      longTermCareAnnualCost: 40000,
      longTermCareStartYear: 1,
      longTermCareInflationRatePct: 0.06,
    });
    expect(result.rows[0].longTermCareCost).toBeCloseTo(40000, 4);
    expect(result.rows[4].longTermCareCost).toBeCloseTo(40000 * Math.pow(1.06, 4), 4);
    // Confirm it's NOT using the general 3% inflation rate for this component.
    expect(result.rows[4].longTermCareCost).not.toBeCloseTo(40000 * Math.pow(1.03, 4), 4);
  });

  it('is a strict special case: zero Long-Term Care cost behaves identically to the base track', () => {
    const plain = runWithdrawalTrack(base);
    const withZeroLtc = runWithdrawalTrack({ ...base, longTermCareAnnualCost: 0 });
    expect(withZeroLtc.finalBalance).toBeCloseTo(plain.finalBalance, 6);
  });
});

describe('runWithdrawalTrack — Required Minimum Distributions (RMD)', () => {
  const base = {
    startingBalance: 5_000_000, // large relative to spend, so RMD % clearly exceeds the planned withdrawal
    returns: new Array(10).fill(0.04),
    annualExpense: 60000,
    inflationRatePct: 0.03,
    standardDeduction: 15000,
    taxRatePct: 0.2,
    feePct: 0,
  };

  it('does not force anything before rmdStartYear, or when rmdStartYear/rmdStartAge are omitted', () => {
    const noRmdOption = runWithdrawalTrack(base);
    const beforeStart = runWithdrawalTrack({ ...base, rmdStartYear: 5, rmdStartAge: 73 });
    expect(noRmdOption.rows[0].rmdApplied).toBe(false);
    expect(beforeStart.rows[0].rmdApplied).toBe(false);
    expect(beforeStart.rows[3].rmdApplied).toBe(false); // year 4, still before rmdStartYear 5
    expect(beforeStart.rows[0].grossWithdrawal).toBeCloseTo(noRmdOption.rows[0].grossWithdrawal, 4);
  });

  it('forces the withdrawal up to the IRS-required amount once RMDs start, when that exceeds the planned withdrawal', () => {
    const result = runWithdrawalTrack({ ...base, rmdStartYear: 1, rmdStartAge: 73 });
    const plain = runWithdrawalTrack(base);
    // $5M / 26.5 (age-73 divisor) ≈ $188,679 — far more than the ~$60K-ish planned withdrawal.
    expect(result.rows[0].rmdApplied).toBe(true);
    expect(result.rows[0].grossWithdrawal).toBeCloseTo(5_000_000 / 26.5, 0);
    expect(result.rows[0].grossWithdrawal).toBeGreaterThan(plain.rows[0].grossWithdrawal);
    // Tax owed must reflect the LARGER, RMD-forced withdrawal, not the original planned one.
    expect(result.rows[0].taxOwed).toBeGreaterThan(plain.rows[0].taxOwed);
  });

  it('does not force anything when the RMD amount is smaller than the already-planned withdrawal', () => {
    // A modest balance means the RMD dollar amount is small relative to spend.
    const result = runWithdrawalTrack({
      ...base,
      startingBalance: 200000,
      rmdStartYear: 1,
      rmdStartAge: 73,
    });
    const plain = runWithdrawalTrack({ ...base, startingBalance: 200000 });
    expect(result.rows[0].rmdApplied).toBe(false);
    expect(result.rows[0].grossWithdrawal).toBeCloseTo(plain.rows[0].grossWithdrawal, 4);
  });

  it('uses a shrinking divisor (rising required %) as attained age increases across the track', () => {
    const result = runWithdrawalTrack({ ...base, rmdStartYear: 1, rmdStartAge: 73 });
    // Age 73 in year 1 -> divisor 26.5; age 74 in year 2 -> divisor 25.5 (smaller divisor = bigger required %).
    const impliedDivisorYear1 = result.rows[0].beginningBalance / result.rows[0].grossWithdrawal;
    const impliedDivisorYear2 = result.rows[1].beginningBalance / result.rows[1].grossWithdrawal;
    expect(impliedDivisorYear1).toBeCloseTo(26.5, 1);
    expect(impliedDivisorYear2).toBeCloseTo(25.5, 1);
  });

  it('excludes the Roth share of the balance from the RMD-eligible base (Roths are RMD-exempt)', () => {
    const noRoth = runWithdrawalTrack({ ...base, rmdStartYear: 1, rmdStartAge: 73 });
    const halfRoth = runWithdrawalTrack({ ...base, rmdStartYear: 1, rmdStartAge: 73, rothPortfolioPct: 0.5 });
    // RMD-forced amount should be ~half as large when half the balance is Roth-exempt.
    expect(halfRoth.rows[0].grossWithdrawal).toBeCloseTo(noRoth.rows[0].grossWithdrawal * 0.5, 0);
  });
});

describe('runWithdrawalTrack — Whole Life Cash Value loan buffer (Section 13.13)', () => {
  it('behaves identically whether the whole life fields are provided as explicit zeros or omitted entirely', () => {
    const base = {
      startingBalance: 1_000_000,
      returns: [0.08, -0.05, 0.12],
      annualExpense: 60000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      taxRatePct: 0.15,
      feePct: 0.0003,
    };
    const omitted = runWithdrawalTrack(base);
    const explicitZero = runWithdrawalTrack({
      ...base,
      wholeLifeCashValueAtRetirement: 0,
      wholeLifeCashValueGrowthRatePct: 0,
      wholeLifeLoanInterestRatePct: 0,
    });
    expect(explicitZero.finalBalance).toBeCloseTo(omitted.finalBalance, 6);
    expect(omitted.rows.every((r) => r.wholeLifeCashValueBalance === 0 && r.wholeLifeLoanBalance === 0)).toBe(true);
    expect(explicitZero.rows.every((r) => r.wholeLifeCashValueBalance === 0 && r.wholeLifeLoanBalance === 0)).toBe(
      true,
    );
  });

  it('grows the cash value every year at its own fixed rate, regardless of stock returns', () => {
    // annualExpense = 0 -> no withdrawal need, so the loan mechanic can't
    // interfere; this isolates the cash value's own growth.
    const result = runWithdrawalTrack({
      startingBalance: 100000,
      returns: [0.1, -0.1, 0.2],
      annualExpense: 0,
      inflationRatePct: 0,
      standardDeduction: 0,
      taxRatePct: 0,
      feePct: 0,
      wholeLifeCashValueAtRetirement: 10000,
      wholeLifeCashValueGrowthRatePct: 0.05,
      wholeLifeLoanInterestRatePct: 0.06,
    });
    expect(result.rows[0].wholeLifeCashValueBalance).toBeCloseTo(10500, 4);
    expect(result.rows[1].wholeLifeCashValueBalance).toBeCloseTo(11025, 4);
    expect(result.rows[2].wholeLifeCashValueBalance).toBeCloseTo(11576.25, 4);
    expect(result.rows.every((r) => r.wholeLifeLoanBalance === 0)).toBe(true);
  });

  it('borrows against the cash value instead of selling stock, in a down year with a cash shortfall', () => {
    // No cash bucket, no inflation/tax/deduction -> gross withdrawal = annual
    // expense = 50,000, entirely unmet by the 30,000 stock balance alone.
    const result = runWithdrawalTrack({
      startingBalance: 30000,
      returns: [-0.1],
      annualExpense: 50000,
      inflationRatePct: 0,
      standardDeduction: 0,
      taxRatePct: 0,
      feePct: 0,
      wholeLifeCashValueAtRetirement: 100000,
      wholeLifeCashValueGrowthRatePct: 0.05,
      wholeLifeLoanInterestRatePct: 0.06,
    });
    // The entire 50,000 withdrawal came from the loan, so stock only shrank
    // by the market return, not by any withdrawal: 30,000 * 0.9 = 27,000.
    expect(result.rows[0].stockBalance).toBeCloseTo(27000, 4);
    expect(result.rows[0].wholeLifeLoanBalance).toBeCloseTo(53000, 4); // 50,000 * 1.06
    expect(result.rows[0].wholeLifeCashValueBalance).toBeCloseTo(105000, 4); // 100,000 * 1.05
  });

  it('caps the loan draw at available capacity, forcing the remaining shortfall from stock', () => {
    const result = runWithdrawalTrack({
      startingBalance: 30000,
      returns: [-0.1],
      annualExpense: 50000,
      inflationRatePct: 0,
      standardDeduction: 0,
      taxRatePct: 0,
      feePct: 0,
      wholeLifeCashValueAtRetirement: 20000, // caps well short of the 50,000 need
      wholeLifeCashValueGrowthRatePct: 0.05,
      wholeLifeLoanInterestRatePct: 0.06,
    });
    // Loan draws the full 20,000 capacity; the remaining 30,000 shortfall is
    // forced from stock, fully depleting it before the return is applied.
    expect(result.rows[0].wholeLifeLoanBalance).toBeCloseTo(21200, 4); // 20,000 * 1.06
    expect(result.rows[0].stockBalance).toBeCloseTo(0, 4);
  });

  it('does not draw a loan in an up year, even when a shortfall exists', () => {
    const result = runWithdrawalTrack({
      startingBalance: 10000,
      returns: [0.08],
      annualExpense: 50000,
      inflationRatePct: 0,
      standardDeduction: 0,
      taxRatePct: 0,
      feePct: 0,
      wholeLifeCashValueAtRetirement: 100000,
      wholeLifeCashValueGrowthRatePct: 0.05,
      wholeLifeLoanInterestRatePct: 0.06,
    });
    expect(result.rows[0].wholeLifeLoanBalance).toBe(0);
    expect(result.rows[0].stockBalance).toBeCloseTo(0, 4); // fully drained by the unmet shortfall
    expect(result.rows[0].wholeLifeCashValueBalance).toBeCloseTo(105000, 4); // still grows regardless
  });

  it('repays the outstanding loan from stock gains before refilling the cash bucket, even when that leaves the bucket only partially refilled', () => {
    const config = {
      startingBalance: 60000,
      returns: [-0.1, -0.1, -0.1, 0.01, -0.05],
      annualExpense: 10000,
      inflationRatePct: 0,
      standardDeduction: 0,
      taxRatePct: 0,
      feePct: 0,
      cashBucketYears: 2,
      cashInterestRatePct: 0,
    };
    const withBuffer = runWithdrawalTrack({
      ...config,
      wholeLifeCashValueAtRetirement: 8000,
      wholeLifeCashValueGrowthRatePct: 0.05,
      wholeLifeLoanInterestRatePct: 0.06,
    });
    const withoutBuffer = runWithdrawalTrack(config);

    // By year 4 (the up year), both scenarios have a loan candidate and a
    // cash bucket target of 10,000. Without the buffer there's no loan to
    // repay, so stock gains fully refill the bucket to its 10,000 target.
    expect(withoutBuffer.rows[3].cashBalance).toBeCloseTo(10000, 4);
    expect(withoutBuffer.rows[3].refilled).toBe(true);

    // With the buffer, the outstanding loan is repaid FIRST out of the same
    // stock gains, fully (loan balance hits 0) — but that leaves too little
    // stock to also hit the full 10,000 refill target, so the bucket only
    // gets partially refilled.
    expect(withBuffer.rows[3].wholeLifeLoanBalance).toBeCloseTo(0, 4);
    expect(withBuffer.rows[3].refilled).toBe(true);
    expect(withBuffer.rows[3].cashBalance).toBeCloseTo(8368.828, 2);
    expect(withBuffer.rows[3].cashBalance).toBeLessThan(withoutBuffer.rows[3].cashBalance);
  });

  it('grosses up the loan repayment for tax, since it draws money out of the modeled portfolio into the insurer', () => {
    // annualExpense=8,000 with a flat 20% tax rate and no deduction/roth ->
    // grossWithdrawal = 10,000 exactly (8,000 / 0.8), taxOwed = 2,000.
    const result = runWithdrawalTrack({
      startingBalance: 30000,
      returns: [-0.1, 0.1],
      annualExpense: 8000,
      inflationRatePct: 0,
      standardDeduction: 0,
      taxRatePct: 0.2,
      feePct: 0,
      wholeLifeCashValueAtRetirement: 50000,
      wholeLifeCashValueGrowthRatePct: 0.05,
      wholeLifeLoanInterestRatePct: 0.06,
    });
    // Year 1 (down): shortfall covered entirely by the loan -> loan = 10,000,
    // accruing to 10,600 * 1.06 = 11,236 after year 2's interest.
    // Year 2 (up): the 10,000 withdrawal comes from stock (27,000 -> 17,000
    // -> 18,700 after +10%). Repaying the 11,236 loan needs a grossed-up
    // 14,045 draw (11,236 / 0.8) — affordable out of the 18,700 available.
    expect(result.rows[1].wholeLifeLoanBalance).toBeCloseTo(0, 4);
    expect(result.rows[1].stockBalance).toBeCloseTo(4655, 4); // 18,700 - 14,045
    // Tax owed jumps from the planned 2,000 (spend withdrawal only) to
    // 4,809 — the extra 2,809 is the loan repayment's own tax (14,045 -
    // 11,236), proving it's no longer a tax-free internal transfer.
    expect(result.rows[1].taxOwed).toBeCloseTo(4809, 4);
  });

  it('caps the grossed-up repayment at available stock when it cannot fully cover the loan, leaving the loan partially outstanding', () => {
    const result = runWithdrawalTrack({
      startingBalance: 12000,
      returns: [-0.1, 0.1],
      annualExpense: 8000,
      inflationRatePct: 0,
      standardDeduction: 0,
      taxRatePct: 0.2,
      feePct: 0,
      wholeLifeCashValueAtRetirement: 50000,
      wholeLifeCashValueGrowthRatePct: 0.05,
      wholeLifeLoanInterestRatePct: 0.06,
    });
    // Only 880 of stock is available in year 2, nowhere near the 14,045
    // needed to fully repay the 11,236 loan — so it draws everything it
    // has (880), nets 704 after tax (880 * 0.8) toward the loan, and 10,532
    // stays outstanding, still accruing interest next year.
    expect(result.rows[1].stockBalance).toBeCloseTo(0, 4);
    expect(result.rows[1].wholeLifeLoanBalance).toBeCloseTo(10532, 4);
    expect(result.rows[1].taxOwed).toBeCloseTo(2176, 4); // 2,000 planned + 176 on the 880 draw
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

describe('runMonteCarloDistribution — pre-retirement lifecycle mode', () => {
  function seededRandom(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  }

  const base = {
    startingBalance: 999999, // deliberately distinct from any lifecycle-computed value, so we can tell if it leaked through
    historicalReturnPool: [0.1], // single value -> every drawn return is 0.1, making growth fully deterministic
    years: 5,
    annualExpense: 40000,
    inflationRatePct: 0.03,
    standardDeduction: 15000,
    taxRatePct: 0.15,
    feePct: 0,
    trials: 10,
    randomFn: seededRandom(1),
  };

  it('is a strict special case: preRetirementYears 0/undefined behaves identically to passing startingBalance directly', () => {
    const withoutLifecycle = runMonteCarloDistribution(base);
    const explicitlyZero = runMonteCarloDistribution({ ...base, preRetirementYears: 0 });
    expect(explicitlyZero.medianTrialRows[0].beginningBalance).toBeCloseTo(
      withoutLifecycle.medianTrialRows[0].beginningBalance,
      6,
    );
  });

  it('grows preRetirementStartingBalance + contributions through the pre-retirement leg using the deterministic pool', () => {
    const result = runMonteCarloDistribution({
      ...base,
      preRetirementYears: 3,
      preRetirementStartingBalance: 100000,
      preRetirementAnnualContribution: 20000,
    });
    // Hand-computed: (100000+20000)*1.1 = 132000 -> (132000+20000)*1.1 = 167200 -> (167200+20000)*1.1 = 205920
    const expectedBalanceAtRetirement = 205920;
    expect(result.medianTrialRows[0].beginningBalance).toBeCloseTo(expectedBalanceAtRetirement, 0);
    // The passed-in startingBalance (999999) must NOT leak through when lifecycle mode is active.
    expect(result.medianTrialRows[0].beginningBalance).not.toBeCloseTo(999999, 0);
  });

  it('produces medianTrialRows covering only the withdrawal years, not the pre-retirement years', () => {
    const result = runMonteCarloDistribution({
      ...base,
      preRetirementYears: 10,
      preRetirementStartingBalance: 100000,
      preRetirementAnnualContribution: 20000,
    });
    expect(result.medianTrialRows.length).toBeLessThanOrEqual(base.years);
  });

  it('a larger pre-retirement contribution produces a larger balance at retirement', () => {
    const lowContribution = runMonteCarloDistribution({
      ...base,
      preRetirementYears: 5,
      preRetirementStartingBalance: 100000,
      preRetirementAnnualContribution: 5000,
    });
    const highContribution = runMonteCarloDistribution({
      ...base,
      preRetirementYears: 5,
      preRetirementStartingBalance: 100000,
      preRetirementAnnualContribution: 30000,
    });
    expect(highContribution.medianTrialRows[0].beginningBalance).toBeGreaterThan(
      lowContribution.medianTrialRows[0].beginningBalance,
    );
  });

  it('exposes medianTrialPreRetirementRows with exact year-by-year detail, undefined when lifecycle mode is off', () => {
    const withoutLifecycle = runMonteCarloDistribution(base);
    expect(withoutLifecycle.medianTrialPreRetirementRows).toBeUndefined();

    const result = runMonteCarloDistribution({
      ...base,
      preRetirementYears: 3,
      preRetirementStartingBalance: 100000,
      preRetirementAnnualContribution: 20000,
    });
    const preRows = result.medianTrialPreRetirementRows;
    expect(preRows).toHaveLength(3);
    expect(preRows![0]).toMatchObject({
      year: 1,
      beginningBalance: 100000,
      contribution: 20000,
      returnApplied: 0.1,
      endingBalance: 132000,
    });
    expect(preRows![1].beginningBalance).toBeCloseTo(132000, 4);
    expect(preRows![2].endingBalance).toBeCloseTo(205920, 0);
    // The pre-retirement leg's own final balance must be exactly what fed the withdrawal phase.
    expect(result.medianTrialRows[0].beginningBalance).toBeCloseTo(preRows![2].endingBalance, 4);
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
        longTermCareAnnualCost: 0,
        longTermCareStartAge: 80,
        longTermCareInflationRatePct: 0.05,
        startingBalanceOverride: 0,
        currentBalance: 0,
        preRetirementAnnualContribution: 0,
        historicalDataStartYear: SP500_DATA_MIN_YEAR,
        blockLengthYears: 7,
        rothPortfolioPct: 0,
        wholeLifeCashValueAtRetirement: 0,
        wholeLifeCashValueGrowthRatePct: 0.045,
        wholeLifeLoanInterestRatePct: 0.06,
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
      longTermCareAnnualCost: 0,
      longTermCareStartAge: 80,
      longTermCareInflationRatePct: 0.05,
      startingBalanceOverride: 0,
      currentBalance: 0,
      preRetirementAnnualContribution: 0,
      historicalDataStartYear: SP500_DATA_MIN_YEAR,
      blockLengthYears: 7,
      rothPortfolioPct: 0,
      wholeLifeCashValueAtRetirement: 0,
      wholeLifeCashValueGrowthRatePct: 0.045,
      wholeLifeLoanInterestRatePct: 0.06,
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
      longTermCareAnnualCost: 0,
      longTermCareStartAge: 80,
      longTermCareInflationRatePct: 0.05,
      startingBalanceOverride: 0,
      currentBalance: 0,
      preRetirementAnnualContribution: 0,
      historicalDataStartYear: SP500_DATA_MIN_YEAR,
      blockLengthYears: 7,
      rothPortfolioPct: 0,
      wholeLifeCashValueAtRetirement: 0,
      wholeLifeCashValueGrowthRatePct: 0.045,
      wholeLifeLoanInterestRatePct: 0.06,
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

  it('converts Long-Term Care Start Age into a track-relative start year and increases withdrawals from that year on', () => {
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
      socialSecurityAnnualBenefit: 0,
      socialSecurityClaimingAge: 65,
      socialSecurityTaxablePortionPct: 0.85,
      otherAnnualIncome: 0,
      reverseMortgageAnnualIncome: 0,
      longTermCareAnnualCost: 40000,
      longTermCareStartAge: 80, // stopWorkingAge 65 + 15 -> starts in track year 16
      longTermCareInflationRatePct: 0.05,
      startingBalanceOverride: 0,
      currentBalance: 0,
      preRetirementAnnualContribution: 0,
      historicalDataStartYear: SP500_DATA_MIN_YEAR,
      blockLengthYears: 7,
      rothPortfolioPct: 0,
      wholeLifeCashValueAtRetirement: 0,
      wholeLifeCashValueGrowthRatePct: 0.045,
      wholeLifeLoanInterestRatePct: 0.06,
    };
    const result = runDistributionComparison({
      startingBalanceActual: 3_000_000,
      distributionInputs,
      monteCarloTrials: 60,
      randomFn: seededRandom(4),
    });
    const rows = result.monteCarlo.medianTrialRows;
    expect(rows[14].longTermCareCost).toBe(0); // year 15, age 79 — not started yet
    expect(rows[15].longTermCareCost).toBeCloseTo(40000, 4); // year 16, age 80 — starts here
    // (grossWithdrawal itself is exercised RMD-free at the runWithdrawalTrack
    // level — here RMD is also active from age 73/75 onward, which would
    // make a direct row-to-row grossWithdrawal comparison balance-path-
    // dependent and flaky rather than a clean test of this age conversion.)
  });

  it('derives RMD start age (73 vs 75) from Current Age + calendar year per SECURE 2.0, and exposes it on the result', () => {
    const baseInputs = {
      stopWorkingAge: 70,
      planThroughAge: 95,
      annualExpense: 60000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      federalTaxRatePct: 0.15,
      stateTaxRatePct: 0.05,
      managementFeePct: 0.0003,
      cashBucketYears: 0,
      cashInterestRatePct: 0,
      socialSecurityAnnualBenefit: 0,
      socialSecurityClaimingAge: 70,
      socialSecurityTaxablePortionPct: 0.85,
      otherAnnualIncome: 0,
      reverseMortgageAnnualIncome: 0,
      longTermCareAnnualCost: 0,
      longTermCareStartAge: 80,
      longTermCareInflationRatePct: 0.05,
      startingBalanceOverride: 0,
      currentBalance: 0,
      preRetirementAnnualContribution: 0,
      historicalDataStartYear: SP500_DATA_MIN_YEAR,
      blockLengthYears: 7,
      rothPortfolioPct: 0,
      wholeLifeCashValueAtRetirement: 0,
      wholeLifeCashValueGrowthRatePct: 0.045,
      wholeLifeLoanInterestRatePct: 0.06,
    };

    const bornBefore1960 = runDistributionComparison({
      startingBalanceActual: 2_000_000,
      distributionInputs: { ...baseInputs, currentAge: 67 }, // birth year 1959
      currentCalendarYear: 2026,
      monteCarloTrials: 30,
      randomFn: seededRandom(6),
    });
    const bornIn1960OrLater = runDistributionComparison({
      startingBalanceActual: 2_000_000,
      distributionInputs: { ...baseInputs, currentAge: 66 }, // birth year 1960
      currentCalendarYear: 2026,
      monteCarloTrials: 30,
      randomFn: seededRandom(6),
    });

    expect(bornBefore1960.rmdStartAge).toBe(73);
    expect(bornIn1960OrLater.rmdStartAge).toBe(75);
  });

  it('forces at least one year of RMD-driven withdrawal for a large balance once the RMD age is reached', () => {
    const distributionInputs = {
      currentAge: 67, // birth year 1959 -> RMD starts at 73
      stopWorkingAge: 70,
      planThroughAge: 95,
      annualExpense: 40000, // modest relative to the large balance below
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      federalTaxRatePct: 0.15,
      stateTaxRatePct: 0.05,
      managementFeePct: 0.0003,
      cashBucketYears: 0,
      cashInterestRatePct: 0,
      socialSecurityAnnualBenefit: 0,
      socialSecurityClaimingAge: 70,
      socialSecurityTaxablePortionPct: 0.85,
      otherAnnualIncome: 0,
      reverseMortgageAnnualIncome: 0,
      longTermCareAnnualCost: 0,
      longTermCareStartAge: 80,
      longTermCareInflationRatePct: 0.05,
      startingBalanceOverride: 0,
      currentBalance: 0,
      preRetirementAnnualContribution: 0,
      historicalDataStartYear: SP500_DATA_MIN_YEAR,
      blockLengthYears: 7,
      rothPortfolioPct: 0,
      wholeLifeCashValueAtRetirement: 0,
      wholeLifeCashValueGrowthRatePct: 0.045,
      wholeLifeLoanInterestRatePct: 0.06,
    };
    const result = runDistributionComparison({
      startingBalanceActual: 8_000_000,
      distributionInputs,
      currentCalendarYear: 2026,
      monteCarloTrials: 30,
      randomFn: seededRandom(9),
    });
    expect(result.rmdStartAge).toBe(73);
    expect(result.monteCarlo.medianTrialRows.some((r) => r.rmdApplied)).toBe(true);
  });

  it('activates lifecycle mode when currentBalance > 0, deriving preRetirementYears from Stop-Working Age - Current Age', () => {
    const distributionInputs = {
      currentAge: 45,
      stopWorkingAge: 65, // 20 years of pre-retirement accumulation
      planThroughAge: 90,
      annualExpense: 60000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      federalTaxRatePct: 0.15,
      stateTaxRatePct: 0.05,
      managementFeePct: 0,
      cashBucketYears: 0,
      cashInterestRatePct: 0,
      socialSecurityAnnualBenefit: 0,
      socialSecurityClaimingAge: 65,
      socialSecurityTaxablePortionPct: 0.85,
      otherAnnualIncome: 0,
      reverseMortgageAnnualIncome: 0,
      longTermCareAnnualCost: 0,
      longTermCareStartAge: 80,
      longTermCareInflationRatePct: 0.05,
      startingBalanceOverride: 0,
      currentBalance: 150000,
      preRetirementAnnualContribution: 15000,
      historicalDataStartYear: SP500_DATA_MIN_YEAR,
      blockLengthYears: 7,
      rothPortfolioPct: 0,
      wholeLifeCashValueAtRetirement: 0,
      wholeLifeCashValueGrowthRatePct: 0.045,
      wholeLifeLoanInterestRatePct: 0.06,
    };
    // A trivially small startingBalanceActual would fail almost every trial
    // if it were actually used — proves lifecycle mode ignored it entirely
    // and instead grew currentBalance + contributions over 20 years.
    const result = runDistributionComparison({
      startingBalanceActual: 1,
      distributionInputs,
      monteCarloTrials: 100,
      randomFn: seededRandom(11),
    });
    expect(result.monteCarlo.medianTrialRows[0].beginningBalance).toBeGreaterThan(150000);
    expect(result.monteCarlo.successRatePct).toBeGreaterThan(0);
  });

  it('lets currentBalance take priority over startingBalanceOverride when both are set', () => {
    const distributionInputs = {
      currentAge: 60,
      stopWorkingAge: 65,
      planThroughAge: 80,
      annualExpense: 40000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      federalTaxRatePct: 0.15,
      stateTaxRatePct: 0.05,
      managementFeePct: 0,
      cashBucketYears: 0,
      cashInterestRatePct: 0,
      socialSecurityAnnualBenefit: 0,
      socialSecurityClaimingAge: 65,
      socialSecurityTaxablePortionPct: 0.85,
      otherAnnualIncome: 0,
      reverseMortgageAnnualIncome: 0,
      longTermCareAnnualCost: 0,
      longTermCareStartAge: 80,
      longTermCareInflationRatePct: 0.05,
      startingBalanceOverride: 5_000_000, // would dominate if it were used
      currentBalance: 100000,
      preRetirementAnnualContribution: 10000,
      historicalDataStartYear: SP500_DATA_MIN_YEAR,
      blockLengthYears: 7,
      rothPortfolioPct: 0,
      wholeLifeCashValueAtRetirement: 0,
      wholeLifeCashValueGrowthRatePct: 0.045,
      wholeLifeLoanInterestRatePct: 0.06,
    };
    const result = runDistributionComparison({
      startingBalanceActual: 5_000_000, // matches the override, to isolate which one actually won
      distributionInputs,
      monteCarloTrials: 50,
      randomFn: seededRandom(12),
    });
    // 5 years of growing ~100K + 10K/year could not plausibly reach anywhere
    // near 5,000,000 — confirms currentBalance (lifecycle), not the override
    // or startingBalanceActual, determined the outcome.
    expect(result.monteCarlo.medianTrialRows[0].beginningBalance).toBeLessThan(1_000_000);
  });

  it('restricts the return pool to historicalDataStartYear and reports the effective range used', () => {
    const distributionInputs = {
      currentAge: 40,
      stopWorkingAge: 65,
      planThroughAge: 95,
      annualExpense: 80000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      federalTaxRatePct: 0.15,
      stateTaxRatePct: 0.05,
      managementFeePct: 0.0003,
      cashBucketYears: 0,
      cashInterestRatePct: 0,
      socialSecurityAnnualBenefit: 0,
      socialSecurityClaimingAge: 67,
      socialSecurityTaxablePortionPct: 0.85,
      otherAnnualIncome: 0,
      reverseMortgageAnnualIncome: 0,
      longTermCareAnnualCost: 0,
      longTermCareStartAge: 80,
      longTermCareInflationRatePct: 0.05,
      startingBalanceOverride: 0,
      currentBalance: 0,
      preRetirementAnnualContribution: 0,
      historicalDataStartYear: 1960,
      blockLengthYears: 7,
      rothPortfolioPct: 0,
      wholeLifeCashValueAtRetirement: 0,
      wholeLifeCashValueGrowthRatePct: 0.045,
      wholeLifeLoanInterestRatePct: 0.06,
    };
    const result = runDistributionComparison({
      startingBalanceActual: 1_500_000,
      distributionInputs,
      monteCarloTrials: 30,
      randomFn: seededRandom(15),
    });
    expect(result.historicalDataStartYear).toBe(1960);
    expect(result.historicalDataEndYear).toBe(SP500_DATA_MAX_YEAR);
  });

  it('clamps historicalDataStartYear below the dataset minimum up to the actual earliest year', () => {
    const distributionInputs = {
      currentAge: 40,
      stopWorkingAge: 65,
      planThroughAge: 95,
      annualExpense: 80000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      federalTaxRatePct: 0.15,
      stateTaxRatePct: 0.05,
      managementFeePct: 0.0003,
      cashBucketYears: 0,
      cashInterestRatePct: 0,
      socialSecurityAnnualBenefit: 0,
      socialSecurityClaimingAge: 67,
      socialSecurityTaxablePortionPct: 0.85,
      otherAnnualIncome: 0,
      reverseMortgageAnnualIncome: 0,
      longTermCareAnnualCost: 0,
      longTermCareStartAge: 80,
      longTermCareInflationRatePct: 0.05,
      startingBalanceOverride: 0,
      currentBalance: 0,
      preRetirementAnnualContribution: 0,
      historicalDataStartYear: SP500_DATA_MIN_YEAR - 50,
      blockLengthYears: 7,
      rothPortfolioPct: 0,
      wholeLifeCashValueAtRetirement: 0,
      wholeLifeCashValueGrowthRatePct: 0.045,
      wholeLifeLoanInterestRatePct: 0.06,
    };
    const result = runDistributionComparison({
      startingBalanceActual: 1_500_000,
      distributionInputs,
      monteCarloTrials: 30,
      randomFn: seededRandom(16),
    });
    expect(result.historicalDataStartYear).toBe(SP500_DATA_MIN_YEAR);
  });

  it('threads a custom blockLengthYears through to the underlying block bootstrap', () => {
    const distributionInputs = {
      currentAge: 40,
      stopWorkingAge: 65,
      planThroughAge: 95,
      annualExpense: 80000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      federalTaxRatePct: 0.15,
      stateTaxRatePct: 0.05,
      managementFeePct: 0.0003,
      cashBucketYears: 0,
      cashInterestRatePct: 0,
      socialSecurityAnnualBenefit: 0,
      socialSecurityClaimingAge: 67,
      socialSecurityTaxablePortionPct: 0.85,
      otherAnnualIncome: 0,
      reverseMortgageAnnualIncome: 0,
      longTermCareAnnualCost: 0,
      longTermCareStartAge: 80,
      longTermCareInflationRatePct: 0.05,
      startingBalanceOverride: 0,
      currentBalance: 0,
      preRetirementAnnualContribution: 0,
      historicalDataStartYear: SP500_DATA_MIN_YEAR,
      blockLengthYears: 10,
      rothPortfolioPct: 0,
      wholeLifeCashValueAtRetirement: 0,
      wholeLifeCashValueGrowthRatePct: 0.045,
      wholeLifeLoanInterestRatePct: 0.06,
    };
    // Just a smoke test that a non-default block length doesn't error and
    // still produces a valid result — the block-length mechanism itself is
    // covered in depth by sampleBlockBootstrapReturns's own tests.
    const result = runDistributionComparison({
      startingBalanceActual: 1_500_000,
      distributionInputs,
      monteCarloTrials: 30,
      randomFn: seededRandom(17),
    });
    expect(result.monteCarlo.medianTrialRows.length).toBeGreaterThan(0);
  });

  it('threads rothPortfolioPct through end-to-end, reducing the required withdrawal and the RMD-eligible base', () => {
    const baseInputs = {
      currentAge: 67, // birth year ~1959 -> RMD starts at 73
      stopWorkingAge: 70,
      planThroughAge: 95,
      annualExpense: 60000,
      inflationRatePct: 0.03,
      standardDeduction: 15000,
      federalTaxRatePct: 0.15,
      stateTaxRatePct: 0.05,
      managementFeePct: 0.0003,
      cashBucketYears: 0,
      cashInterestRatePct: 0,
      socialSecurityAnnualBenefit: 0,
      socialSecurityClaimingAge: 70,
      socialSecurityTaxablePortionPct: 0.85,
      otherAnnualIncome: 0,
      reverseMortgageAnnualIncome: 0,
      longTermCareAnnualCost: 0,
      longTermCareStartAge: 80,
      longTermCareInflationRatePct: 0.05,
      startingBalanceOverride: 0,
      currentBalance: 0,
      preRetirementAnnualContribution: 0,
      historicalDataStartYear: SP500_DATA_MIN_YEAR,
      blockLengthYears: 7,
      wholeLifeCashValueAtRetirement: 0,
      wholeLifeCashValueGrowthRatePct: 0.045,
      wholeLifeLoanInterestRatePct: 0.06,
    };
    const noRoth = runDistributionComparison({
      startingBalanceActual: 8_000_000, // large enough that RMD forcing kicks in
      distributionInputs: { ...baseInputs, rothPortfolioPct: 0 },
      currentCalendarYear: 2026,
      monteCarloTrials: 30,
      randomFn: seededRandom(18),
    });
    const withRoth = runDistributionComparison({
      startingBalanceActual: 8_000_000,
      distributionInputs: { ...baseInputs, rothPortfolioPct: 0.35 },
      currentCalendarYear: 2026,
      monteCarloTrials: 30,
      randomFn: seededRandom(18),
    });
    // Same seed/inputs otherwise, so any difference in the first year's
    // withdrawal comes from the Roth exclusion (either the RMD base or the
    // tax gross-up, whichever dominates that year).
    expect(withRoth.monteCarlo.medianTrialRows[0].grossWithdrawal).toBeLessThan(
      noRoth.monteCarlo.medianTrialRows[0].grossWithdrawal,
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

  it('skips the accumulation-window check entirely when Starting Balance Override is in use', () => {
    const errors = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 80, // 45 years into a 30-year window — would normally fail
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
        startingBalanceOverride: 500000,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'stopWorkingAge')).toBe(false);
  });

  it('still enforces stopWorkingAge > currentAge even when Starting Balance Override is in use', () => {
    // The override only bypasses the ACCUMULATION-WINDOW check — basic
    // ordering sanity (can't retire before/at current age) still applies.
    const errors = validateDistributionInputs(
      {
        currentAge: 65,
        stopWorkingAge: 65,
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
        startingBalanceOverride: 500000,
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

  it('flags a negative Long-Term Care cost, an out-of-range start age, and an out-of-range LTC inflation rate', () => {
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
        longTermCareAnnualCost: -1000,
        longTermCareStartAge: 150,
        longTermCareInflationRatePct: 0.5,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'longTermCareAnnualCost')).toBe(true);
    expect(errors.some((e) => e.field === 'longTermCareStartAge')).toBe(true);
    expect(errors.some((e) => e.field === 'longTermCareInflationRatePct')).toBe(true);
  });

  it('flags a negative starting balance override', () => {
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
        startingBalanceOverride: -1000,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'startingBalanceOverride')).toBe(true);
  });

  it('allows a positive starting balance override', () => {
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
        startingBalanceOverride: 500000,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'startingBalanceOverride')).toBe(false);
  });

  it('flags a negative current balance or negative pre-retirement contribution', () => {
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
        currentBalance: -1000,
        preRetirementAnnualContribution: -500,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'currentBalance')).toBe(true);
    expect(errors.some((e) => e.field === 'preRetirementAnnualContribution')).toBe(true);
  });

  it('skips the accumulation-window check when currentBalance (lifecycle mode) is in use, same as Starting Balance Override', () => {
    const errors = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 80, // 45 years into a 30-year window — would normally fail
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
        currentBalance: 100000,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'stopWorkingAge')).toBe(false);
  });

  it('flags a historicalDataStartYear that leaves too few years of real data to sample from', () => {
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
        historicalDataStartYear: SP500_DATA_MAX_YEAR - 2, // leaves only 3 years
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'historicalDataStartYear')).toBe(true);
  });

  it('flags a historicalDataStartYear before the dataset actually starts', () => {
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
        historicalDataStartYear: SP500_DATA_MIN_YEAR - 10,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'historicalDataStartYear')).toBe(true);
  });

  it('allows a reasonable historicalDataStartYear like 1960', () => {
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
        historicalDataStartYear: 1960,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'historicalDataStartYear')).toBe(false);
  });

  it('flags a blockLengthYears outside 1-20', () => {
    const tooLow = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 64,
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
        blockLengthYears: 0,
      },
      phase1,
    );
    const tooHigh = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 64,
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
        blockLengthYears: 21,
      },
      phase1,
    );
    expect(tooLow.some((e) => e.field === 'blockLengthYears')).toBe(true);
    expect(tooHigh.some((e) => e.field === 'blockLengthYears')).toBe(true);
  });

  it('allows a reasonable blockLengthYears like 7 or 10', () => {
    const errors7 = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 64,
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
        blockLengthYears: 7,
      },
      phase1,
    );
    const errors10 = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 64,
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
        blockLengthYears: 10,
      },
      phase1,
    );
    expect(errors7.some((e) => e.field === 'blockLengthYears')).toBe(false);
    expect(errors10.some((e) => e.field === 'blockLengthYears')).toBe(false);
  });

  it('flags a rothPortfolioPct outside 0-1', () => {
    const tooLow = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 64,
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
        rothPortfolioPct: -0.1,
        wholeLifeCashValueAtRetirement: 0,
        wholeLifeCashValueGrowthRatePct: 0.045,
        wholeLifeLoanInterestRatePct: 0.06,
      },
      phase1,
    );
    const tooHigh = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 64,
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
        rothPortfolioPct: 1.1,
        wholeLifeCashValueAtRetirement: 0,
        wholeLifeCashValueGrowthRatePct: 0.045,
        wholeLifeLoanInterestRatePct: 0.06,
      },
      phase1,
    );
    expect(tooLow.some((e) => e.field === 'rothPortfolioPct')).toBe(true);
    expect(tooHigh.some((e) => e.field === 'rothPortfolioPct')).toBe(true);
  });

  it('allows a reasonable rothPortfolioPct like 35%', () => {
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
        rothPortfolioPct: 0.35,
        wholeLifeCashValueAtRetirement: 0,
        wholeLifeCashValueGrowthRatePct: 0.045,
        wholeLifeLoanInterestRatePct: 0.06,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'rothPortfolioPct')).toBe(false);
  });

  it('flags a negative wholeLifeCashValueAtRetirement', () => {
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
        wholeLifeCashValueAtRetirement: -1000,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'wholeLifeCashValueAtRetirement')).toBe(true);
  });

  it('flags a wholeLifeCashValueGrowthRatePct or wholeLifeLoanInterestRatePct outside 0-15%', () => {
    const tooHighGrowth = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 64,
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
        wholeLifeCashValueGrowthRatePct: 0.2,
      },
      phase1,
    );
    const negativeGrowth = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 64,
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
        wholeLifeCashValueGrowthRatePct: -0.01,
      },
      phase1,
    );
    const tooHighLoanRate = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 64,
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        federalTaxRatePct: 0.15,
        stateTaxRatePct: 0.05,
        managementFeePct: 0.0003,
        wholeLifeLoanInterestRatePct: 0.16,
      },
      phase1,
    );
    expect(tooHighGrowth.some((e) => e.field === 'wholeLifeCashValueGrowthRatePct')).toBe(true);
    expect(negativeGrowth.some((e) => e.field === 'wholeLifeCashValueGrowthRatePct')).toBe(true);
    expect(tooHighLoanRate.some((e) => e.field === 'wholeLifeLoanInterestRatePct')).toBe(true);
  });

  it('allows reasonable whole life buffer values like a 4.5% growth rate and a 6% loan rate', () => {
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
        wholeLifeCashValueAtRetirement: 150000,
        wholeLifeCashValueGrowthRatePct: 0.045,
        wholeLifeLoanInterestRatePct: 0.06,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'wholeLifeCashValueAtRetirement')).toBe(false);
    expect(errors.some((e) => e.field === 'wholeLifeCashValueGrowthRatePct')).toBe(false);
    expect(errors.some((e) => e.field === 'wholeLifeLoanInterestRatePct')).toBe(false);
  });
});
