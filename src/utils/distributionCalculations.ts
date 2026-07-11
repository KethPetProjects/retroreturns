import { SP500_FALLBACK_DATA } from '../data/sp500Fallback';
import type { DistributionInputs, SimulationYearRow } from '../types';

/**
 * Finds Phase 1's real (sequenced-return) balance at the point retirement
 * begins, which may be any year during accumulation — not just the very
 * end. E.g. retiring 27 years into a 30-year accumulation window should use
 * year 27's balance, not force retirement to align with the full endpoint.
 * yearsIntoAccumulation at or past the last modeled year falls back to the
 * final row (matches the "retiring right as/after accumulation ends" case).
 */
export function getActualBalanceAtRetirement(
  rows: SimulationYearRow[],
  yearsIntoAccumulation: number,
): number | undefined {
  if (rows.length === 0) return undefined;
  if (yearsIntoAccumulation >= rows.length) {
    return rows[rows.length - 1].actualBalance;
  }
  if (yearsIntoAccumulation < 1) return undefined;
  return rows[yearsIntoAccumulation - 1].actualBalance;
}

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
  returnApplied: number; // stock return applied this year
  endingBalance: number;
  stockBalance: number;
  cashBalance: number;
  /** Whether the cash bucket was topped back up from stocks this year. */
  refilled: boolean;
}

export interface WithdrawalTrackResult {
  rows: WithdrawalYearResult[];
  /** 1-based year the balance first hit zero, or null if it survived the full horizon. */
  depletedAtYear: number | null;
  finalBalance: number;
}

function projectGrossWithdrawals(
  years: number,
  annualExpense: number,
  inflationRatePct: number,
  standardDeduction: number,
  taxRatePct: number,
): number[] {
  const projected: number[] = [];
  for (let i = 0; i < years; i++) {
    const inflationFactor = Math.pow(1 + inflationRatePct, i);
    const netExpenseTarget = annualExpense * inflationFactor;
    const yearStandardDeduction = standardDeduction * inflationFactor;
    projected.push(grossUpWithdrawal(netExpenseTarget, yearStandardDeduction, taxRatePct));
  }
  return projected;
}

/** Sum of the next cashBucketYears years' projected gross withdrawals, starting at fromIndex (0-based), capped at however many years remain. */
function cashBucketTarget(projected: number[], fromIndex: number, cashBucketYears: number): number {
  let target = 0;
  const end = Math.min(fromIndex + cashBucketYears, projected.length);
  for (let k = fromIndex; k < end; k++) {
    target += projected[k];
  }
  return target;
}

/**
 * Year-by-year withdrawal engine (Section 13.3), extended with an optional
 * cash "bucket" strategy: cashBucketYears worth of upcoming withdrawals are
 * held in a low-volatility cash account (earning cashInterestRatePct) and
 * drawn down first, so ordinary withdrawals don't force stock sales during a
 * market downturn. The bucket is topped back up from stocks only in years
 * the stock return was positive — refilling after a down year would sell
 * stocks at a loss, defeating the point of holding the buffer. If a
 * downturn drains the bucket before a refill opportunity comes, the
 * shortfall is pulled from stocks that year regardless (unavoidable, but
 * visible via each row's stockBalance/cashBalance split).
 *
 * cashBucketYears = 0 (the default) disables the bucket — every withdrawal
 * comes straight from a single balance, same as a plain withdrawal engine.
 */
export function runWithdrawalTrack(
  startingBalance: number,
  returns: number[],
  annualExpense: number,
  inflationRatePct: number,
  standardDeduction: number,
  taxRatePct: number,
  feePct: number,
  cashBucketYears: number = 0,
  cashInterestRatePct: number = 0,
): WithdrawalTrackResult {
  const projected = projectGrossWithdrawals(
    returns.length,
    annualExpense,
    inflationRatePct,
    standardDeduction,
    taxRatePct,
  );

  const initialCashTarget = cashBucketTarget(projected, 0, cashBucketYears);
  let cashBalance = Math.min(startingBalance, initialCashTarget);
  let stockBalance = startingBalance - cashBalance;

  const rows: WithdrawalYearResult[] = [];
  let depletedAtYear: number | null = null;

  for (let i = 0; i < returns.length; i++) {
    if (stockBalance <= 0 && cashBalance <= 0) break;

    const yearIndex = i + 1;
    const inflationFactor = Math.pow(1 + inflationRatePct, i);
    const netExpenseTarget = annualExpense * inflationFactor;
    const yearStandardDeduction = standardDeduction * inflationFactor;
    const grossWithdrawal = projected[i];
    const taxOwed = computeTaxOwed(grossWithdrawal, yearStandardDeduction, taxRatePct);

    const beginningBalance = stockBalance + cashBalance;

    // Draw from cash first; any shortfall is a forced stock sale.
    const fromCash = Math.min(cashBalance, grossWithdrawal);
    cashBalance -= fromCash;
    const fromStock = Math.min(stockBalance, grossWithdrawal - fromCash);
    stockBalance -= fromStock;

    const returnApplied = returns[i];
    stockBalance = Math.max(0, stockBalance * (1 + returnApplied - feePct));
    cashBalance = Math.max(0, cashBalance * (1 + cashInterestRatePct));

    // Refill only after an up year — never sell stocks low just to top off cash.
    let refilled = false;
    if (returnApplied > 0 && cashBucketYears > 0) {
      const target = cashBucketTarget(projected, i + 1, cashBucketYears);
      const transfer = Math.min(Math.max(0, target - cashBalance), stockBalance);
      if (transfer > 0) {
        stockBalance -= transfer;
        cashBalance += transfer;
        refilled = true;
      }
    }

    const endingBalance = stockBalance + cashBalance;

    rows.push({
      year: yearIndex,
      beginningBalance,
      netExpenseTarget,
      grossWithdrawal,
      taxOwed,
      returnApplied,
      endingBalance,
      stockBalance,
      cashBalance,
      refilled,
    });

    if (endingBalance <= 0) {
      depletedAtYear = yearIndex;
    }
  }

  return { rows, depletedAtYear, finalBalance: stockBalance + cashBalance };
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
  cashBucketYears: number = 0,
  cashInterestRatePct: number = 0,
): MonteCarloResult {
  const results: WithdrawalTrackResult[] = [];

  for (let t = 0; t < trials; t++) {
    const returns = Array.from(
      { length: years },
      () => historicalReturnPool[Math.floor(randomFn() * historicalReturnPool.length)],
    );
    results.push(
      runWithdrawalTrack(
        startingBalance,
        returns,
        annualExpense,
        inflationRatePct,
        standardDeduction,
        taxRatePct,
        feePct,
        cashBucketYears,
        cashInterestRatePct,
      ),
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
  /** Phase 1's pre-tax final ACTUAL balance (before Phase 1's own end-of-period haircut) — the real, sequenced-return starting point. */
  startingBalanceActual: number;
  distributionInputs: DistributionInputs;
  monteCarloTrials?: number;
  randomFn?: () => number;
}

export interface DistributionComparisonResult {
  years: number;
  monteCarlo: MonteCarloResult;
}

/**
 * Ties Phase 1's real sequenced-return ending balance into Phase 3's Monte
 * Carlo volatility simulation. Originally also ran a smooth "Average-Rate"
 * scenario alongside this (Section 13.4 point 3's Scenario A), but that was
 * removed — the flat arithmetic-mean rate was confusing and never failed,
 * so it added no real signal on top of the Monte Carlo success rate/outcome
 * distribution, which is what actually answers "how long will it last."
 */
export function runDistributionComparison(
  inputs: DistributionComparisonInputs,
): DistributionComparisonResult {
  const { startingBalanceActual, distributionInputs, monteCarloTrials = DEFAULT_MONTE_CARLO_TRIALS, randomFn } =
    inputs;
  const {
    stopWorkingAge,
    planThroughAge,
    annualExpense,
    inflationRatePct,
    standardDeduction,
    taxRatePct,
    managementFeePct,
    cashBucketYears,
    cashInterestRatePct,
  } = distributionInputs;
  const years = Math.max(1, Math.trunc(planThroughAge - stopWorkingAge));

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
    cashBucketYears,
    cashInterestRatePct,
  );

  return { years, monteCarlo };
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
  const {
    currentAge,
    stopWorkingAge,
    planThroughAge,
    annualExpense,
    standardDeduction,
    taxRatePct,
    managementFeePct,
    cashBucketYears,
    cashInterestRatePct,
  } = inputs;

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

  if (cashBucketYears !== undefined && (cashBucketYears < 0 || cashBucketYears > 10)) {
    errors.push({ field: 'cashBucketYears', message: 'Cash bucket years must be between 0 and 10.' });
  }

  if (cashInterestRatePct !== undefined && (cashInterestRatePct < 0 || cashInterestRatePct > 0.1)) {
    errors.push({
      field: 'cashInterestRatePct',
      message: 'Cash interest rate must be between 0% and 10%.',
    });
  }

  if (currentAge !== undefined && stopWorkingAge !== undefined && !Number.isNaN(currentAge) && !Number.isNaN(stopWorkingAge)) {
    // Retirement can begin at any point during Phase 1's accumulation window
    // (using that year's actual balance, not just the final one), or up to
    // one year immediately after it ends (using the final balance unchanged).
    // It's invalid to retire before accumulation even starts, or long enough
    // after it ends that there's an unmodeled gap with no growth assumption.
    const yearsIntoAccumulation = stopWorkingAge - currentAge;
    const retirementYear = phase1.startingYear + yearsIntoAccumulation;
    const lastAccumulationYear = phase1.startingYear + phase1.numberOfYears - 1;

    if (yearsIntoAccumulation < 1) {
      errors.push({
        field: 'stopWorkingAge',
        message: `Stop-working age implies retirement starts in ${retirementYear}, before the Accumulation section's simulation even begins in ${phase1.startingYear}.`,
      });
    } else if (yearsIntoAccumulation > phase1.numberOfYears + 1) {
      errors.push({
        field: 'stopWorkingAge',
        message: `Stop-working age implies retirement starts in ${retirementYear}, well after the Accumulation section's simulation ends in ${lastAccumulationYear}. Extend Accumulation's Number of Years, or lower Stop-Working Age.`,
      });
    }
  }

  return errors;
}
