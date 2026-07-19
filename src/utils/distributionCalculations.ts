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
 * IRS Uniform Lifetime Table (effective 2022, unchanged through 2026) —
 * "account balance ÷ this divisor" gives the Required Minimum Distribution
 * for a given attained age. Divisor shrinks as age increases, so the
 * required withdrawal % climbs over time (~3.8% at 73, ~8% by the 90s).
 * Source: IRS Publication 590-B / Uniform Lifetime Table.
 */
const RMD_UNIFORM_LIFETIME_DIVISORS: Record<number, number> = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2,
  81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2,
  91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4,
  101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5,
  111: 3.4, 112: 3.3, 113: 3.1, 114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0,
};

/** Ages below 72 never call this (RMDs haven't started); ages above 120 use the table's final divisor, per IRS guidance that 2.0 applies "at age 120 and older." */
export function rmdDivisorForAge(age: number): number {
  const clampedAge = Math.min(120, Math.max(72, Math.round(age)));
  return RMD_UNIFORM_LIFETIME_DIVISORS[clampedAge];
}

/**
 * SECURE 2.0 Act: RMDs start at 73 for those born 1951-1959, and 75 for
 * those born 1960 or later.
 */
export function rmdStartAgeForBirthYear(birthYear: number): number {
  return birthYear >= 1960 ? 75 : 73;
}

/**
 * Solves for the gross portfolio withdrawal G such that, after tax on the
 * combined taxable income (G plus any other taxable income sources) above a
 * standard deduction, total spendable cash — G plus all non-taxable and
 * taxable outside income — nets exactly netExpenseTarget. Generalizes the
 * single-source case (grossUpWithdrawal) to a household with Social
 * Security / other income pooled into one combined tax bill, mirroring how
 * real unified tax filing works rather than taxing each source separately.
 *
 * taxableFixedIncome = outside income that counts toward taxable income
 * (e.g. the taxable portion of Social Security, other taxable income).
 * fixedIncome = ALL outside income that's actually spendable (taxable and
 * tax-free, e.g. reverse mortgage draws), which directly offsets how much
 * needs to come from the portfolio at all.
 */
export function solveGrossWithdrawal(
  netExpenseTarget: number,
  standardDeduction: number,
  taxRatePct: number,
  taxableFixedIncome: number = 0,
  fixedIncome: number = 0,
): number {
  const netFromPortfolio = netExpenseTarget - fixedIncome;
  if (netFromPortfolio <= 0) return 0;
  if (taxRatePct <= 0) return netFromPortfolio;

  const candidateGross =
    (netFromPortfolio + (taxableFixedIncome - standardDeduction) * taxRatePct) / (1 - taxRatePct);
  // If the combined taxable income at this candidate gross wouldn't actually
  // exceed the deduction, no tax is owed at all and G is just the net need.
  return candidateGross + taxableFixedIncome > standardDeduction
    ? Math.max(0, candidateGross)
    : netFromPortfolio;
}

/**
 * Solves for the gross (pre-tax) withdrawal G such that, after tax on the
 * portion of G above the standard deduction, the retiree nets exactly
 * netAmount to spend. Tax is a flat rate above a deduction, not real
 * progressive brackets — a deliberate simplification (see project decision
 * to start with a simple tax model and layer in bracket-awareness later).
 * The zero-other-income special case of solveGrossWithdrawal.
 */
export function grossUpWithdrawal(netAmount: number, standardDeduction: number, taxRatePct: number): number {
  return solveGrossWithdrawal(netAmount, standardDeduction, taxRatePct);
}

export function computeCombinedTaxOwed(
  grossWithdrawal: number,
  standardDeduction: number,
  taxRatePct: number,
  taxableFixedIncome: number = 0,
): number {
  return Math.max(0, grossWithdrawal + taxableFixedIncome - standardDeduction) * taxRatePct;
}

export function computeTaxOwed(grossWithdrawal: number, standardDeduction: number, taxRatePct: number): number {
  return computeCombinedTaxOwed(grossWithdrawal, standardDeduction, taxRatePct);
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
  /** This year's Social Security income (0 before the claiming age). */
  socialSecurityIncome: number;
  /** This year's other income (rents/dividends), inflated from year 1. */
  otherIncome: number;
  /** This year's reverse mortgage draw, inflated from year 1, tax-free. */
  reverseMortgageIncome: number;
  /** This year's extra Long-Term Care spending need (0 before its start age), added into netExpenseTarget. */
  longTermCareCost: number;
  /** Whether the IRS Required Minimum Distribution forced this year's withdrawal above what the expense/LTC plan alone would have required. */
  rmdApplied: boolean;
}

export interface WithdrawalTrackResult {
  rows: WithdrawalYearResult[];
  /** 1-based year the balance first hit zero, or null if it survived the full horizon. */
  depletedAtYear: number | null;
  finalBalance: number;
}

interface ProjectedYearPlan {
  netExpenseTarget: number;
  yearStandardDeduction: number;
  socialSecurityIncome: number;
  otherIncome: number;
  reverseMortgageIncome: number;
  longTermCareCost: number;
  /** Portion of fixedIncome that's taxable — needed to recompute tax if RMD forces a larger withdrawal than planned (see runWithdrawalTrack). */
  taxableFixedIncome: number;
  grossWithdrawal: number;
  taxOwed: number;
}

function projectYearlyPlan(
  years: number,
  annualExpense: number,
  inflationRatePct: number,
  standardDeduction: number,
  taxRatePct: number,
  socialSecurityAnnualBenefit: number,
  socialSecurityStartYear: number,
  socialSecurityTaxablePortionPct: number,
  otherAnnualIncome: number,
  reverseMortgageAnnualIncome: number,
  longTermCareAnnualCost: number,
  longTermCareStartYear: number,
  longTermCareInflationRatePct: number,
): ProjectedYearPlan[] {
  const projected: ProjectedYearPlan[] = [];
  for (let i = 0; i < years; i++) {
    const yearIndex = i + 1;
    const inflationFactor = Math.pow(1 + inflationRatePct, i);
    const yearStandardDeduction = standardDeduction * inflationFactor;

    // Social Security inflates from ITS OWN claiming year, not from year 1 of
    // retirement — otherwise a benefit that hasn't started yet would look
    // like it already inflated during the years before claiming.
    const socialSecurityIncome =
      socialSecurityAnnualBenefit > 0 && yearIndex >= socialSecurityStartYear
        ? socialSecurityAnnualBenefit * Math.pow(1 + inflationRatePct, yearIndex - socialSecurityStartYear)
        : 0;
    const otherIncome = otherAnnualIncome * inflationFactor;
    // Unlike Social Security/Other Income, a real reverse mortgage "tenure"
    // payment is a fixed nominal dollar amount for life — it does not get a
    // cost-of-living adjustment, so this deliberately does NOT inflate.
    const reverseMortgageIncome = reverseMortgageAnnualIncome;

    // Long-Term Care is extra SPENDING (not income), inflated at its own
    // rate from its own start year — real LTC/care costs have historically
    // outpaced general inflation, hence the separate rate. Once started it
    // runs through the rest of the plan (no separate end age).
    const longTermCareCost =
      longTermCareAnnualCost > 0 && yearIndex >= longTermCareStartYear
        ? longTermCareAnnualCost * Math.pow(1 + longTermCareInflationRatePct, yearIndex - longTermCareStartYear)
        : 0;
    const netExpenseTarget = annualExpense * inflationFactor + longTermCareCost;

    // Reverse mortgage proceeds are loan proceeds, not taxable income, so
    // they're excluded from taxableFixedIncome but still count toward
    // fixedIncome (spendable cash that offsets the portfolio withdrawal).
    const taxableFixedIncome = socialSecurityIncome * socialSecurityTaxablePortionPct + otherIncome;
    const fixedIncome = socialSecurityIncome + otherIncome + reverseMortgageIncome;

    const grossWithdrawal = solveGrossWithdrawal(
      netExpenseTarget,
      yearStandardDeduction,
      taxRatePct,
      taxableFixedIncome,
      fixedIncome,
    );
    const taxOwed = computeCombinedTaxOwed(grossWithdrawal, yearStandardDeduction, taxRatePct, taxableFixedIncome);

    projected.push({
      netExpenseTarget,
      yearStandardDeduction,
      socialSecurityIncome,
      otherIncome,
      reverseMortgageIncome,
      longTermCareCost,
      taxableFixedIncome,
      grossWithdrawal,
      taxOwed,
    });
  }
  return projected;
}

/** Sum of the next cashBucketYears years' projected gross portfolio withdrawals, starting at fromIndex (0-based), capped at however many years remain. Fixed income (SS/other/reverse mortgage) isn't bucketed — it arrives on its own regardless of market conditions. */
function cashBucketTarget(projected: ProjectedYearPlan[], fromIndex: number, cashBucketYears: number): number {
  let target = 0;
  const end = Math.min(fromIndex + cashBucketYears, projected.length);
  for (let k = fromIndex; k < end; k++) {
    target += projected[k].grossWithdrawal;
  }
  return target;
}

export interface RunWithdrawalTrackOptions {
  startingBalance: number;
  returns: number[];
  annualExpense: number;
  inflationRatePct: number;
  standardDeduction: number;
  /** Combined federal + state flat rate. */
  taxRatePct: number;
  feePct: number;
  /** Years of upcoming withdrawals held in cash. 0 (default) disables the bucket entirely. */
  cashBucketYears?: number;
  cashInterestRatePct?: number;
  socialSecurityAnnualBenefit?: number;
  /** 1-based year within this track Social Security starts (1 = starts immediately in year 1). */
  socialSecurityStartYear?: number;
  socialSecurityTaxablePortionPct?: number;
  otherAnnualIncome?: number;
  reverseMortgageAnnualIncome?: number;
  longTermCareAnnualCost?: number;
  /** 1-based year within this track Long-Term Care costs start (1 = starts immediately in year 1). */
  longTermCareStartYear?: number;
  longTermCareInflationRatePct?: number;
  /** 1-based year within this track Required Minimum Distributions start. Undefined (the default) disables RMD forcing entirely. */
  rmdStartYear?: number;
  /** Attained age at rmdStartYear (73 or 75 per SECURE 2.0) — used together with rmdStartYear to look up each subsequent year's IRS divisor. */
  rmdStartAge?: number;
}

/**
 * Year-by-year withdrawal engine (Section 13.3), extended with:
 *  - an optional cash "bucket" strategy: cashBucketYears worth of upcoming
 *    portfolio withdrawals are held in a low-volatility cash account
 *    (earning cashInterestRatePct) and drawn down first, so ordinary
 *    withdrawals don't force stock sales during a market downturn. The
 *    bucket is topped back up from stocks only in years the stock return
 *    was positive — refilling after a down year would sell stocks at a
 *    loss, defeating the point of holding the buffer. cashBucketYears = 0
 *    (the default) disables the bucket entirely.
 *  - optional outside income streams (Social Security, other income, a
 *    simplified flat reverse mortgage draw) that reduce how much needs to
 *    come from the portfolio each year, pooled into one combined tax
 *    calculation the same way a real household files one unified return
 *    rather than taxing each income source separately.
 *  - an optional Long-Term Care cost: extra SPENDING (not income) added on
 *    top of the annual expense starting at its own start year, inflated at
 *    its own (typically higher) rate, running through the rest of the plan.
 *  - optional Required Minimum Distribution (RMD) forcing: once rmdStartYear
 *    is reached, each year's withdrawal is bumped up to the IRS-required
 *    minimum (this year's beginning balance ÷ the Uniform Lifetime Table
 *    divisor for that age) whenever that's larger than what the expense/LTC
 *    plan alone would have withdrawn. Unlike every other input here, RMD
 *    depends on the simulated balance path, so it can't be precomputed in
 *    projectYearlyPlan — it's evaluated fresh each year inside this loop.
 */
export function runWithdrawalTrack(options: RunWithdrawalTrackOptions): WithdrawalTrackResult {
  const {
    startingBalance,
    returns,
    annualExpense,
    inflationRatePct,
    standardDeduction,
    taxRatePct,
    feePct,
    cashBucketYears = 0,
    cashInterestRatePct = 0,
    socialSecurityAnnualBenefit = 0,
    socialSecurityStartYear = 1,
    socialSecurityTaxablePortionPct = 0,
    otherAnnualIncome = 0,
    reverseMortgageAnnualIncome = 0,
    longTermCareAnnualCost = 0,
    longTermCareStartYear = 1,
    longTermCareInflationRatePct = 0,
    rmdStartYear,
    rmdStartAge,
  } = options;

  const projected = projectYearlyPlan(
    returns.length,
    annualExpense,
    inflationRatePct,
    standardDeduction,
    taxRatePct,
    socialSecurityAnnualBenefit,
    socialSecurityStartYear,
    socialSecurityTaxablePortionPct,
    otherAnnualIncome,
    reverseMortgageAnnualIncome,
    longTermCareAnnualCost,
    longTermCareStartYear,
    longTermCareInflationRatePct,
  );

  const initialCashTarget = cashBucketTarget(projected, 0, cashBucketYears);
  let cashBalance = Math.min(startingBalance, initialCashTarget);
  let stockBalance = startingBalance - cashBalance;

  const rows: WithdrawalYearResult[] = [];
  let depletedAtYear: number | null = null;

  for (let i = 0; i < returns.length; i++) {
    if (stockBalance <= 0 && cashBalance <= 0) break;

    const yearIndex = i + 1;
    const {
      netExpenseTarget,
      socialSecurityIncome,
      otherIncome,
      reverseMortgageIncome,
      longTermCareCost,
      yearStandardDeduction,
      taxableFixedIncome,
      grossWithdrawal: plannedGrossWithdrawal,
      taxOwed: plannedTaxOwed,
    } = projected[i];

    const beginningBalance = stockBalance + cashBalance;

    // RMD depends on the simulated balance path (unlike everything else in
    // projected[i], which is precomputed independent of returns), so it's
    // evaluated fresh here rather than in projectYearlyPlan. Forces the
    // withdrawal up to the IRS-required minimum whenever that's larger than
    // the expense/LTC plan alone would have withdrawn — the excess isn't
    // tracked further (spent or reinvested elsewhere), it just leaves this
    // portfolio, taxed like any other withdrawal.
    let grossWithdrawal = plannedGrossWithdrawal;
    let taxOwed = plannedTaxOwed;
    let rmdApplied = false;
    if (rmdStartYear !== undefined && rmdStartAge !== undefined && yearIndex >= rmdStartYear) {
      const age = rmdStartAge + (yearIndex - rmdStartYear);
      const rmdAmount = beginningBalance / rmdDivisorForAge(age);
      if (rmdAmount > grossWithdrawal) {
        grossWithdrawal = rmdAmount;
        taxOwed = computeCombinedTaxOwed(grossWithdrawal, yearStandardDeduction, taxRatePct, taxableFixedIncome);
        rmdApplied = true;
      }
    }

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
      socialSecurityIncome,
      otherIncome,
      reverseMortgageIncome,
      longTermCareCost,
      rmdApplied,
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
  /** The depletion year of the trial ranked at the 50th percentile across ALL trials (survivors included, ranked as better than any failure) — the same trial exposed via medianTrialRows. Null whenever that trial is itself a survivor, i.e. whenever success rate is at or above 50%. */
  medianDepletionYear: number | null;
  /** The depletion year of the trial ranked at the 10th percentile across ALL trials — a "bad-case" reference point. Null if that trial is a survivor, i.e. fewer than ~10% of trials failed. */
  worstDecileDepletionYear: number | null;
  /** The single trial ranked at the 50th percentile across all trials, for charting a representative path — the same trial medianDepletionYear is read from. */
  medianTrialRows: WithdrawalYearResult[];
}

export interface RunMonteCarloDistributionOptions {
  startingBalance: number;
  historicalReturnPool: number[];
  years: number;
  annualExpense: number;
  inflationRatePct: number;
  standardDeduction: number;
  /** Combined federal + state flat rate. */
  taxRatePct: number;
  feePct: number;
  trials: number;
  randomFn?: () => number;
  cashBucketYears?: number;
  cashInterestRatePct?: number;
  socialSecurityAnnualBenefit?: number;
  socialSecurityStartYear?: number;
  socialSecurityTaxablePortionPct?: number;
  otherAnnualIncome?: number;
  reverseMortgageAnnualIncome?: number;
  longTermCareAnnualCost?: number;
  longTermCareStartYear?: number;
  longTermCareInflationRatePct?: number;
  rmdStartYear?: number;
  rmdStartAge?: number;
  /** Years of pre-retirement accumulation to simulate before the withdrawal phase, drawing from the SAME per-trial randomized return sequence — correlates pre- and post-retirement market conditions instead of treating "balance at retirement" as a single fixed number. 0 or undefined (the default) disables this entirely; startingBalance is then used directly, exactly as before. */
  preRetirementYears?: number;
  /** What you actually have TODAY, used as the pre-retirement leg's starting point. Only relevant when preRetirementYears > 0. */
  preRetirementStartingBalance?: number;
  /** Flat nominal annual contribution during the pre-retirement leg (does not inflate, matching Phase 1's convention). Only relevant when preRetirementYears > 0. */
  preRetirementAnnualContribution?: number;
}

/**
 * Runs many independent trials, each bootstrap-resampling annual returns
 * (with replacement) from the real historical return pool rather than
 * replaying one fixed historical sequence — captures a distribution of
 * possible outcomes instead of a single arbitrary path (project decision:
 * randomized Monte Carlo over a deterministic historical replay).
 *
 * When preRetirementYears > 0, each trial draws ONE continuous sequence of
 * returns spanning BOTH the pre-retirement accumulation years and the
 * withdrawal years, and grows preRetirementStartingBalance + contributions
 * through the first segment before handing the result to runWithdrawalTrack
 * as that same trial's startingBalance for the remaining segment. This
 * deliberately correlates pre- and post-retirement market conditions within
 * a trial (a rough decade right before retirement also shapes what that
 * same trial's withdrawal phase looks like) rather than treating "balance
 * at retirement" as a single fixed, uncertainty-free number.
 */
export function runMonteCarloDistribution(options: RunMonteCarloDistributionOptions): MonteCarloResult {
  const {
    startingBalance,
    historicalReturnPool,
    years,
    annualExpense,
    inflationRatePct,
    standardDeduction,
    taxRatePct,
    feePct,
    trials,
    randomFn = Math.random,
    cashBucketYears = 0,
    cashInterestRatePct = 0,
    socialSecurityAnnualBenefit = 0,
    socialSecurityStartYear = 1,
    socialSecurityTaxablePortionPct = 0,
    otherAnnualIncome = 0,
    reverseMortgageAnnualIncome = 0,
    longTermCareAnnualCost = 0,
    longTermCareStartYear = 1,
    longTermCareInflationRatePct = 0,
    rmdStartYear,
    rmdStartAge,
    preRetirementYears = 0,
    preRetirementStartingBalance = 0,
    preRetirementAnnualContribution = 0,
  } = options;

  const results: WithdrawalTrackResult[] = [];

  for (let t = 0; t < trials; t++) {
    const drawnReturns = Array.from(
      { length: preRetirementYears + years },
      () => historicalReturnPool[Math.floor(randomFn() * historicalReturnPool.length)],
    );

    let trialStartingBalance = startingBalance;
    let withdrawalReturns = drawnReturns;

    if (preRetirementYears > 0) {
      const accumulationReturns = drawnReturns.slice(0, preRetirementYears);
      withdrawalReturns = drawnReturns.slice(preRetirementYears);

      let balance = preRetirementStartingBalance;
      for (const r of accumulationReturns) {
        // Contribution at start of year, then that year's return/fee — same
        // convention as Phase 1's accumulation engine and this file's own
        // withdrawal-phase growth formula.
        balance = (balance + preRetirementAnnualContribution) * (1 + r - feePct);
      }
      trialStartingBalance = balance;
    }

    results.push(
      runWithdrawalTrack({
        startingBalance: trialStartingBalance,
        returns: withdrawalReturns,
        annualExpense,
        inflationRatePct,
        standardDeduction,
        taxRatePct,
        feePct,
        cashBucketYears,
        cashInterestRatePct,
        socialSecurityAnnualBenefit,
        socialSecurityStartYear,
        socialSecurityTaxablePortionPct,
        otherAnnualIncome,
        reverseMortgageAnnualIncome,
        longTermCareAnnualCost,
        longTermCareStartYear,
        longTermCareInflationRatePct,
        rmdStartYear,
        rmdStartAge,
      }),
    );
  }

  const successCount = results.filter((r) => r.depletedAtYear === null).length;
  const depletionYears = results
    .filter((r) => r.depletedAtYear !== null)
    .map((r) => r.depletedAtYear!)
    .sort((a, b) => a - b);

  // Rank every trial from worst outcome to best (earliest depletion is worst;
  // among survivors, lower final balance is worse). Percentile stats and the
  // representative trial shown in the chart/table are both read off this
  // SAME ranking, so they can never disagree — e.g. if fewer than half the
  // trials failed, the trial at the 50th-percentile position is necessarily
  // a survivor, and medianDepletionYear correctly comes out null (matching
  // what the table/chart show) instead of reporting the median of the
  // failures-only subset, which was misleading whenever success rate != 50%.
  const ranked = [...results].sort((a, b) => {
    const aKey = a.depletedAtYear ?? Infinity;
    const bKey = b.depletedAtYear ?? Infinity;
    if (aKey !== bKey) return aKey - bKey;
    return a.finalBalance - b.finalBalance;
  });
  const medianTrial = ranked[Math.floor(ranked.length / 2)];
  const medianDepletionYear = medianTrial.depletedAtYear;

  const worstDecileTrial = ranked[Math.floor(ranked.length * 0.1)];
  const worstDecileDepletionYear = worstDecileTrial.depletedAtYear;

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
  /** Calendar year "today" is in, used with Current Age to derive birth year (and thus which SECURE 2.0 RMD start age applies). Defaults to the real current year; overridable for deterministic testing. */
  currentCalendarYear?: number;
}

export interface DistributionComparisonResult {
  years: number;
  monteCarlo: MonteCarloResult;
  /** Age Required Minimum Distributions start (73 or 75, derived from Current Age via SECURE 2.0's birth-year rule) — RMDs are always modeled, assuming the whole portfolio is a tax-deferred account; there's no toggle to disable them. */
  rmdStartAge: number;
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
  const {
    startingBalanceActual,
    distributionInputs,
    monteCarloTrials = DEFAULT_MONTE_CARLO_TRIALS,
    randomFn,
    currentCalendarYear = new Date().getFullYear(),
  } = inputs;
  const {
    currentAge,
    stopWorkingAge,
    planThroughAge,
    annualExpense,
    inflationRatePct,
    standardDeduction,
    federalTaxRatePct,
    stateTaxRatePct,
    managementFeePct,
    cashBucketYears,
    cashInterestRatePct,
    socialSecurityAnnualBenefit,
    socialSecurityClaimingAge,
    socialSecurityTaxablePortionPct,
    otherAnnualIncome,
    reverseMortgageAnnualIncome,
    longTermCareAnnualCost,
    longTermCareStartAge,
    longTermCareInflationRatePct,
    currentBalance,
    preRetirementAnnualContribution,
  } = distributionInputs;
  const years = Math.max(1, Math.trunc(planThroughAge - stopWorkingAge));
  // currentBalance > 0 activates lifecycle mode (13.11) and takes priority
  // over whatever startingBalanceActual the caller passed in — that value
  // was either Starting Balance Override or the Accumulation tab's
  // carried-over balance, both of which represent a single fixed number at
  // retirement, superseded here by a per-trial projection from today.
  const preRetirementYears = currentBalance > 0 ? Math.max(0, stopWorkingAge - currentAge) : 0;
  const combinedTaxRatePct = federalTaxRatePct + stateTaxRatePct;
  // Social Security's own claiming age is independent of Stop-Working Age —
  // it may start before, at, or (more commonly) after retirement begins.
  // Expressed as a 1-based year within the withdrawal track, where year 1 =
  // stopWorkingAge; clamped to 1 so an already-past claiming age just means
  // benefits start immediately in year 1.
  const socialSecurityStartYear = Math.max(1, socialSecurityClaimingAge - stopWorkingAge + 1);
  // Same conversion as Social Security's claiming age, applied to Long-Term
  // Care's independent start age.
  const longTermCareStartYear = Math.max(1, longTermCareStartAge - stopWorkingAge + 1);
  // RMDs are always modeled (no toggle) — the tool assumes the whole
  // portfolio is a tax-deferred account, consistent with its "401k-style"
  // framing. Start age (73 or 75) is derived from birth year, not asked as
  // its own input.
  const birthYear = currentCalendarYear - currentAge;
  const rmdStartAge = rmdStartAgeForBirthYear(birthYear);
  const rmdStartYear = Math.max(1, rmdStartAge - stopWorkingAge + 1);

  const monteCarlo = runMonteCarloDistribution({
    startingBalance: startingBalanceActual,
    historicalReturnPool: HISTORICAL_TOTAL_RETURN_POOL,
    years,
    annualExpense,
    inflationRatePct,
    standardDeduction,
    taxRatePct: combinedTaxRatePct,
    feePct: managementFeePct,
    trials: monteCarloTrials,
    randomFn,
    cashBucketYears,
    cashInterestRatePct,
    socialSecurityAnnualBenefit,
    socialSecurityStartYear,
    socialSecurityTaxablePortionPct,
    otherAnnualIncome,
    reverseMortgageAnnualIncome,
    longTermCareAnnualCost,
    longTermCareStartYear,
    longTermCareInflationRatePct,
    rmdStartYear,
    rmdStartAge,
    preRetirementYears,
    preRetirementStartingBalance: currentBalance,
    preRetirementAnnualContribution,
  });

  return { years, monteCarlo, rmdStartAge };
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
    federalTaxRatePct,
    stateTaxRatePct,
    managementFeePct,
    cashBucketYears,
    cashInterestRatePct,
    socialSecurityAnnualBenefit,
    socialSecurityClaimingAge,
    socialSecurityTaxablePortionPct,
    otherAnnualIncome,
    reverseMortgageAnnualIncome,
    longTermCareAnnualCost,
    longTermCareStartAge,
    longTermCareInflationRatePct,
    startingBalanceOverride,
    currentBalance,
    preRetirementAnnualContribution,
  } = inputs;

  if (startingBalanceOverride !== undefined && startingBalanceOverride < 0) {
    errors.push({
      field: 'startingBalanceOverride',
      message: 'Starting balance override cannot be negative.',
    });
  }

  if (currentBalance !== undefined && currentBalance < 0) {
    errors.push({ field: 'currentBalance', message: 'Current balance cannot be negative.' });
  }

  if (preRetirementAnnualContribution !== undefined && preRetirementAnnualContribution < 0) {
    errors.push({
      field: 'preRetirementAnnualContribution',
      message: 'Pre-retirement annual contribution cannot be negative.',
    });
  }

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

  if (federalTaxRatePct !== undefined && (federalTaxRatePct < 0 || federalTaxRatePct > 0.5)) {
    errors.push({ field: 'federalTaxRatePct', message: 'Federal tax rate must be between 0% and 50%.' });
  }

  if (stateTaxRatePct !== undefined && (stateTaxRatePct < 0 || stateTaxRatePct > 0.15)) {
    errors.push({ field: 'stateTaxRatePct', message: 'State tax rate must be between 0% and 15%.' });
  }

  if (
    federalTaxRatePct !== undefined &&
    stateTaxRatePct !== undefined &&
    federalTaxRatePct + stateTaxRatePct >= 1
  ) {
    errors.push({
      field: 'stateTaxRatePct',
      message: 'Combined federal + state tax rate cannot reach 100%.',
    });
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

  if (socialSecurityAnnualBenefit !== undefined && socialSecurityAnnualBenefit < 0) {
    errors.push({
      field: 'socialSecurityAnnualBenefit',
      message: 'Social Security benefit cannot be negative.',
    });
  }

  if (
    socialSecurityClaimingAge !== undefined &&
    (Number.isNaN(socialSecurityClaimingAge) || socialSecurityClaimingAge < 0 || socialSecurityClaimingAge > 100)
  ) {
    errors.push({
      field: 'socialSecurityClaimingAge',
      message: 'Social Security claiming age must be between 0 and 100.',
    });
  }

  if (
    socialSecurityTaxablePortionPct !== undefined &&
    (socialSecurityTaxablePortionPct < 0 || socialSecurityTaxablePortionPct > 1)
  ) {
    errors.push({
      field: 'socialSecurityTaxablePortionPct',
      message: 'Social Security taxable portion must be between 0% and 100%.',
    });
  }

  if (otherAnnualIncome !== undefined && otherAnnualIncome < 0) {
    errors.push({ field: 'otherAnnualIncome', message: 'Other annual income cannot be negative.' });
  }

  if (reverseMortgageAnnualIncome !== undefined && reverseMortgageAnnualIncome < 0) {
    errors.push({
      field: 'reverseMortgageAnnualIncome',
      message: 'Reverse mortgage annual income cannot be negative.',
    });
  }

  if (longTermCareAnnualCost !== undefined && longTermCareAnnualCost < 0) {
    errors.push({
      field: 'longTermCareAnnualCost',
      message: 'Long-Term Care annual cost cannot be negative.',
    });
  }

  if (
    longTermCareStartAge !== undefined &&
    (Number.isNaN(longTermCareStartAge) || longTermCareStartAge < 0 || longTermCareStartAge > 100)
  ) {
    errors.push({
      field: 'longTermCareStartAge',
      message: 'Long-Term Care start age must be between 0 and 100.',
    });
  }

  if (
    longTermCareInflationRatePct !== undefined &&
    (longTermCareInflationRatePct < 0 || longTermCareInflationRatePct > 0.2)
  ) {
    errors.push({
      field: 'longTermCareInflationRatePct',
      message: 'Long-Term Care inflation rate must be between 0% and 20%.',
    });
  }

  // This whole check exists to keep Accumulation's DOLLAR OUTPUT temporally
  // consistent with when Distribution says retirement happens. Starting
  // Balance Override and Current Balance (lifecycle mode) each replace that
  // dollar output entirely, so the constraint has nothing left to protect —
  // skip it whenever either is in use, so Stop-Working Age can be set freely.
  const bypassesAccumulationWindow =
    (startingBalanceOverride !== undefined && startingBalanceOverride > 0) ||
    (currentBalance !== undefined && currentBalance > 0);

  if (
    !bypassesAccumulationWindow &&
    currentAge !== undefined &&
    stopWorkingAge !== undefined &&
    !Number.isNaN(currentAge) &&
    !Number.isNaN(stopWorkingAge)
  ) {
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
