import { describe, it, expect } from 'vitest';
import {
  grossUpWithdrawal,
  computeTaxOwed,
  runWithdrawalTrack,
  runMonteCarloDistribution,
  runDistributionComparison,
  validateDistributionInputs,
} from '../distributionCalculations';

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

describe('runWithdrawalTrack (Section 13.3)', () => {
  it('grows the net expense target and standard deduction by inflation each year', () => {
    const result = runWithdrawalTrack(1_000_000, [0.05, 0.05, 0.05], 80000, 0.03, 15000, 0, 0);
    expect(result.rows[0].netExpenseTarget).toBeCloseTo(80000, 4);
    expect(result.rows[1].netExpenseTarget).toBeCloseTo(80000 * 1.03, 4);
    expect(result.rows[2].netExpenseTarget).toBeCloseTo(80000 * 1.03 * 1.03, 4);
  });

  it('applies that year\'s return to the balance after the withdrawal, not before', () => {
    const result = runWithdrawalTrack(1_000_000, [0.1], 100000, 0, 0, 0, 0);
    // (1,000,000 - 100,000) * 1.1 = 990,000
    expect(result.rows[0].endingBalance).toBeCloseTo(990000, 2);
  });

  it('stops the simulation the year the balance hits zero, not before or after', () => {
    const result = runWithdrawalTrack(100000, [0, 0, 0, 0, 0], 30000, 0, 0, 0, 0);
    // 100k -30k=70k -30k=40k -30k=10k -30k=-20k -> depletes in year 4
    expect(result.depletedAtYear).toBe(4);
    expect(result.rows).toHaveLength(4);
    expect(result.finalBalance).toBe(0);
  });

  it('reports no depletion when the balance survives the full horizon', () => {
    const result = runWithdrawalTrack(1_000_000, new Array(30).fill(0.07), 30000, 0.03, 15000, 0.15, 0.0003);
    expect(result.depletedAtYear).toBeNull();
    expect(result.finalBalance).toBeGreaterThan(0);
  });

  it('a bad early sequence depletes faster than the same average rate spread evenly (sequence-of-returns risk)', () => {
    // Same three returns, different order: -30% first vs. last.
    const badFirst = runWithdrawalTrack(500000, [-0.3, 0.1, 0.1], 60000, 0, 0, 0, 0);
    const badLast = runWithdrawalTrack(500000, [0.1, 0.1, -0.3], 60000, 0, 0, 0, 0);
    expect(badFirst.finalBalance).toBeLessThan(badLast.finalBalance);
  });

  it('deducts tax-driven gross-up so a taxed track ends with less money than an untaxed one for the same net spend', () => {
    const noTax = runWithdrawalTrack(1_000_000, new Array(10).fill(0.05), 40000, 0, 15000, 0, 0);
    const withTax = runWithdrawalTrack(1_000_000, new Array(10).fill(0.05), 40000, 0, 15000, 0.25, 0);
    expect(noTax.depletedAtYear).toBeNull();
    expect(withTax.depletedAtYear).toBeNull();
    expect(withTax.finalBalance).toBeLessThan(noTax.finalBalance);
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
    const result = runMonteCarloDistribution(
      5_000_000,
      [0.15, 0.18, 0.12, 0.2],
      20,
      30000,
      0.03,
      15000,
      0.15,
      0.0003,
      200,
      seededRandom(42),
    );
    expect(result.successRatePct).toBe(1);
    expect(result.depletionYears).toHaveLength(0);
    expect(result.medianDepletionYear).toBeNull();
  });

  it('reports a low success rate when spend far exceeds what the balance can sustain', () => {
    const result = runMonteCarloDistribution(
      50000,
      [0.05, -0.05, 0.03, -0.1, 0.08],
      30,
      40000,
      0.03,
      15000,
      0.15,
      0.0003,
      200,
      seededRandom(7),
    );
    expect(result.successRatePct).toBeLessThan(0.2);
    expect(result.depletionYears.length).toBeGreaterThan(0);
  });

  it('produces a worst-decile depletion year no later than the median depletion year', () => {
    const result = runMonteCarloDistribution(
      800000,
      [0.15, -0.2, 0.1, -0.05, 0.2, 0.03, -0.15, 0.12],
      30,
      60000,
      0.03,
      15000,
      0.15,
      0.0003,
      500,
      seededRandom(99),
    );
    if (result.worstDecileDepletionYear !== null && result.medianDepletionYear !== null) {
      expect(result.worstDecileDepletionYear).toBeLessThanOrEqual(result.medianDepletionYear);
    }
  });

  it('returns a medianTrialRows path whose length is consistent with its own outcome', () => {
    const result = runMonteCarloDistribution(
      800000,
      [0.15, -0.2, 0.1, -0.05, 0.2, 0.03, -0.15, 0.12],
      30,
      60000,
      0.03,
      15000,
      0.15,
      0.0003,
      300,
      seededRandom(3),
    );
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
        taxRatePct: 0.15,
        managementFeePct: 0.0003,
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
      taxRatePct: 0,
      managementFeePct: 0,
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
        taxRatePct: 0.15,
        managementFeePct: 0.0003,
      },
      phase1,
    );
    expect(errors).toHaveLength(0);
  });

  it('flags a stop-working age that implies retirement starting well before accumulation ends', () => {
    const errors = validateDistributionInputs(
      {
        currentAge: 35,
        stopWorkingAge: 50, // 1995 + 15 = 2010, way before 2024
        planThroughAge: 95,
        annualExpense: 80000,
        standardDeduction: 15000,
        taxRatePct: 0.15,
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
        taxRatePct: 0.15,
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
        taxRatePct: 0.15,
        managementFeePct: 0.0003,
      },
      phase1,
    );
    expect(errors.some((e) => e.field === 'annualExpense')).toBe(true);
  });
});
