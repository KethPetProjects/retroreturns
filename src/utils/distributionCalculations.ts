import { SP500_FALLBACK_DATA } from '../data/sp500Fallback';
import type { DistributionInputs } from '../types';

/**
 * Solves for the gross (pre-tax) withdrawal G such that, after tax on the
 * portion of G above the standard deduction, the retiree nets exactly
 * netAmount to spend. Tax is a flat rate above a deduction, not real
 * progressive brackets — a deliberate simplification (see project decision
 * to start with a simple tax model and layer in bracket-awareness later).
 *
 * net = G - max(0, G - standardDeduction) * taxRatePct
 * Solving the G > standardDeduction case: G = (net - standardDeduction * taxRatePct) / (1 - taxRatePct)
 * If that candidate doesn't actually exceed standardDeduction, no tax is
 * owed at all and G simply equals net.
 */
export function grossUpWithdrawal(netAmount: number, standardDeduction: number, taxRatePct: number): number {
  if (taxRatePct <= 0 || netAmount <= 0) return netAmount;
  const candidateGross = (netAmount - standardDeduction * taxRatePct) / (1 - taxRatePct);
  return candidateGross > standardDeduction ? candidateGross : netAmount;
}

export function computeTaxOwed(grossWithdrawal: number, standardDeduction: number, taxRatePct: number): number {
  return Math.max(0, grossWithdrawal - standardDeduction) * taxRatePct;
}

export interface WithdrawalYearResult {
  year: number; // 1-based year of retirement
  beginningBalance: number;
  netExpenseTarget: number;
  grossWithdrawal: number;
  taxOwed: number;
  returnApplied: number;
  endingBalance: number;
}

export interface WithdrawalTrackResult {
  rows: WithdrawalYearResult[];
  /** 1-based year the balance first hit zero, or null if it survived the full horizon. */
  depletedAtYear: number | null;
  finalBalance: number;
}

/**
 * Generic year-by-year withdrawal engine (Section 13.3): each year, a
 * net-of-tax expense target (grown by inflation from the year-1 input) is
 * grossed up to a pre-tax withdrawal, pulled from the balance, and then
 * that year's return is applied to what's left. Stops the moment the
 * balance hits zero — matches Section 13.3's "stop that track's simulation"
 * behavior rather than continuing to simulate a already-depleted account.
 */
export function runWithdrawalTrack(
  startingBalance: number,
  returns: number[],
  annualExpense: number,
  inflationRatePct: number,
  standardDeduction: number,
  taxRatePct: number,
  feePct: number,
): WithdrawalTrackResult {
  const rows: WithdrawalYearResult[] = [];
  let balance = startingBalance;
  let depletedAtYear: number | null = null;

  for (let i = 0; i < returns.length; i++) {
    if (balance <= 0) break;

    const yearIndex = i + 1;
    const inflationFactor = Math.pow(1 + inflationRatePct, i);
    const netExpenseTarget = annualExpense * inflationFactor;
    const yearStandardDeduction = standardDeduction * inflationFactor;
    const grossWithdrawal = grossUpWithdrawal(netExpenseTarget, yearStandardDeduction, taxRatePct);
    const taxOwed = computeTaxOwed(grossWithdrawal, yearStandardDeduction, taxRatePct);

    const beginningBalance = balance;
    const afterWithdrawal = beginningBalance - grossWithdrawal;
    const returnApplied = returns[i];
    const endingBalanceRaw = afterWithdrawal * (1 + returnApplied - feePct);
    const endingBalance = Math.max(0, endingBalanceRaw);

    rows.push({
      year: yearIndex,
      beginningBalance,
      netExpenseTarget,
      grossWithdrawal,
      taxOwed,
      returnApplied,
      endingBalance,
    });

    if (endingBalanceRaw <= 0) {
      depletedAtYear = yearIndex;
    }

    balance = endingBalance;
  }

  return { rows, depletedAtYear, finalBalance: balance };
}

export interface MonteCarloResult {
  trials: number;
  successCount: number;
  successRatePct: number;
  /** Depletion years for trials that ran out, ascending. Empty if every trial survived. */
  depletionYears: number[];
  medianDepletionYear: number | null;
  /** The depletion year at the 10th percentile of outcomes — a "bad-case" reference point. Null if fewer than ~10% of trials failed. */
  worstDecileDepletionYear: number | null;
  /** The single trial closest to the median outcome, for charting a representative path. */
  medianTrialRows: WithdrawalYearResult[];
}

function percentileOf(sortedAscending: number[], p: number): number {
  const idx = Math.min(sortedAscending.length - 1, Math.floor(p * sortedAscending.length));
  return sortedAscending[idx];
}

/**
 * Runs many independent trials, each bootstrap-resampling annual returns
 * (with replacement) from the real historical return pool rather than
 * replaying one fixed historical sequence — captures a distribution of
 * possible outcomes instead of a single arbitrary path (project decision:
 * randomized Monte Carlo over a deterministic historical replay).
 */
export function runMonteCarloDistribution(
  startingBalance: number,
  historicalReturnPool: number[],
  years: number,
  annualExpense: number,
  inflationRatePct: number,
  standardDeduction: number,
  taxRatePct: number,
  feePct: number,
  trials: number,
  randomFn: () => number = Math.random,
): MonteCarloResult {
  const results: WithdrawalTrackResult[] = [];

  for (let t = 0; t < trials; t++) {
    const returns = Array.from(
      { length: years },
      () => historicalReturnPool[Math.floor(randomFn() * historicalReturnPool.length)],
    );
    results.push(
      runWithdrawalTrack(startingBalance, returns, annualExpense, inflationRatePct, standardDeduction, taxRatePct, feePct),
    );
  }

  const successCount = results.filter((r) => r.depletedAtYear === null).length;
  const depletionYears = results
    .filter((r) => r.depletedAtYear !== null)
    .map((r) => r.depletedAtYear!)
    .sort((a, b) => a - b);

  const medianDepletionYear = depletionYears.length > 0 ? percentileOf(depletionYears, 0.5) : null;
  const worstDecileDepletionYear =
    depletionYears.length >= trials * 0.1 ? percentileOf(depletionYears, 0.1) : null;

  // Representative "median" trial for charting: rank every trial by outcome
  // (depleted-earlier is worse; among survivors, lower final balance is worse),
  // then take the middle-ranked one.
  const ranked = [...results].sort((a, b) => {
    const aKey = a.depletedAtYear ?? Infinity;
    const bKey = b.depletedAtYear ?? Infinity;
    if (aKey !== bKey) return aKey - bKey;
    return a.finalBalance - b.finalBalance;
  });
  const medianTrial = ranked[Math.floor(ranked.length / 2)];

  return {
    trials,
    successCount,
    successRatePct: successCount / trials,
    depletionYears,
    medianDepletionYear,
    worstDecileDepletionYear,
    medianTrialRows: medianTrial.rows,
  };
}

export const HISTORICAL_TOTAL_RETURN_POOL = SP500_FALLBACK_DATA.map((r) => r.totalReturn);

const DEFAULT_MONTE_CARLO_TRIALS = 1000;

export interface DistributionComparisonInputs {
  /** Phase 1's pre-tax final ACTUAL balance (before Phase 1's own end-of-period haircut) — the real, sequenced-return starting point for the volatility scenario. */
  startingBalanceActual: number;
  /** Phase 1's pre-tax final AVERAGE-RATE balance, and the flat rate that produced it — used for the smooth comparison scenario. */
  startingBalanceAverage: number;
  averageRateUsed: number;
  distributionInputs: DistributionInputs;
  monteCarloTrials?: number;
  randomFn?: () => number;
}

export interface DistributionComparisonResult {
  years: number;
  averageRateTrack: WithdrawalTrackResult;
  monteCarlo: MonteCarloResult;
}

/**
 * Ties Phase 1's ending balances into Phase 3's two distribution scenarios
 * (Section 13.4 point 3): Scenario A replays the smooth Average-Rate track
 * forward as a flat-rate withdrawal simulation; Scenario B runs a Monte
 * Carlo volatility simulation starting from Phase 1's real sequenced-return
 * ending balance.
 */
export function runDistributionComparison(
  inputs: DistributionComparisonInputs,
): DistributionComparisonResult {
  const {
    startingBalanceActual,
    startingBalanceAverage,
    averageRateUsed,
    distributionInputs,
    monteCarloTrials = DEFAULT_MONTE_CARLO_TRIALS,
    randomFn,
  } = inputs;
  const { stopWorkingAge, planThroughAge, annualExpense, inflationRatePct, standardDeduction, taxRatePct, managementFeePct } =
    distributionInputs;
  const years = Math.max(1, Math.trunc(planThroughAge - stopWorkingAge));

  const averageRateTrack = runWithdrawalTrack(
    startingBalanceAverage,
    new Array(years).fill(averageRateUsed),
    annualExpense,
    inflationRatePct,
    standardDeduction,
    taxRatePct,
    managementFeePct,
  );

  const monteCarlo = runMonteCarloDistribution(
    startingBalanceActual,
    HISTORICAL_TOTAL_RETURN_POOL,
    years,
    annualExpense,
    inflationRatePct,
    standardDeduction,
    taxRatePct,
    managementFeePct,
    monteCarloTrials,
    randomFn,
  );

  return { years, averageRateTrack, monteCarlo };
}

export interface DistributionValidationError {
  field: string;
  message: string;
}

/**
 * Validation rule from Section 13.2: the retirement year implied by
 * Current Age / Stop-Working Age must land at or immediately after Phase
 * 1's accumulation window ends, so the two phases stay temporally
 * consistent rather than silently disagreeing about when retirement starts.
 */
export function validateDistributionInputs(
  inputs: Partial<DistributionInputs>,
  phase1: { startingYear: number; numberOfYears: number },
): DistributionValidationError[] {
  const errors: DistributionValidationError[] = [];
  const { currentAge, stopWorkingAge, planThroughAge, annualExpense, standardDeduction, taxRatePct, managementFeePct } =
    inputs;

  if (currentAge === undefined || Number.isNaN(currentAge) || currentAge < 0) {
    errors.push({ field: 'currentAge', message: 'Current age is required.' });
  }

  if (
    stopWorkingAge === undefined ||
    Number.isNaN(stopWorkingAge) ||
    (currentAge !== undefined && stopWorkingAge <= currentAge)
  ) {
    errors.push({ field: 'stopWorkingAge', message: 'Stop-working age must be after current age.' });
  }

  if (
    planThroughAge === undefined ||
    Number.isNaN(planThroughAge) ||
    (stopWorkingAge !== undefined && planThroughAge <= stopWorkingAge)
  ) {
    errors.push({ field: 'planThroughAge', message: 'Plan-through age must be after stop-working age.' });
  }

  if (annualExpense === undefined || Number.isNaN(annualExpense) || annualExpense <= 0) {
    errors.push({ field: 'annualExpense', message: 'Annual expense must be greater than $0.' });
  }

  if (standardDeduction !== undefined && standardDeduction < 0) {
    errors.push({ field: 'standardDeduction', message: 'Standard deduction cannot be negative.' });
  }

  if (taxRatePct !== undefined && (taxRatePct < 0 || taxRatePct > 0.5)) {
    errors.push({ field: 'taxRatePct', message: 'Tax rate must be between 0% and 50%.' });
  }

  if (managementFeePct !== undefined && (managementFeePct < 0 || managementFeePct > 0.02)) {
    errors.push({ field: 'managementFeePct', message: 'Management fee must be between 0% and 2%.' });
  }

  if (currentAge !== undefined && stopWorkingAge !== undefined && !Number.isNaN(currentAge) && !Number.isNaN(stopWorkingAge)) {
    const retirementYear = phase1.startingYear + (stopWorkingAge - currentAge);
    // Phase 1 simulates calendar years [startingYear, startingYear + numberOfYears - 1];
    // retirement should begin at or immediately after that last accumulation year.
    const lastAccumulationYear = phase1.startingYear + phase1.numberOfYears - 1;
    if (retirementYear < lastAccumulationYear || retirementYear > lastAccumulationYear + 1) {
      errors.push({
        field: 'stopWorkingAge',
        message: `Stop-working age implies retirement starts in ${retirementYear}, but the Accumulation section's simulation runs through ${lastAccumulationYear}. These should be within a year of each other.`,
      });
    }
  }

  return errors;
}
