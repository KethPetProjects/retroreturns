import { xirr } from './xirr';
import { getAnnualReturn, SP500_DATA_MAX_YEAR, SP500_DATA_MIN_YEAR } from '../data/sp500Fallback';
import type { CashFlow, SimulationInputs, SimulationResult, SimulationYearRow } from '../types';

/** Typical low-cost index fund fee, used as the baseline for isolating fee cost (Section 3.8 "Fee Impact ($)"). */
export const BASELINE_FEE_PCT = 0.0003;

export interface BalanceTrackResult {
  beginningBalances: number[];
  interestEarnings: number[];
  feeAmounts: number[];
  endingBalances: number[];
}

/**
 * Generic year-by-year compounding engine (Section 3.4). Deliberately takes
 * plain contribution/return arrays rather than being hardwired to Phase 1's
 * flat annual contribution — this is what lets Phase 2 reuse it for the
 * whole life policy's 7-pay premium schedule (Section 12.5) and the
 * opportunity-cost side-calculation (Section 12.9) without duplicating the
 * compounding logic.
 */
export function runBalanceTrack(
  startingBalance: number,
  contributions: number[],
  returns: number[],
  feePct: number,
): BalanceTrackResult {
  if (contributions.length !== returns.length) {
    throw new Error('contributions and returns arrays must be the same length');
  }

  const n = contributions.length;
  const beginningBalances: number[] = new Array(n);
  const interestEarnings: number[] = new Array(n);
  const feeAmounts: number[] = new Array(n);
  const endingBalances: number[] = new Array(n);

  let priorBalance = startingBalance;
  for (let i = 0; i < n; i++) {
    const beginningBalance = priorBalance + contributions[i];
    const grossGrowth = beginningBalance * returns[i];
    const feeAmount = beginningBalance * feePct;
    const endingBalance = beginningBalance + grossGrowth - feeAmount;

    beginningBalances[i] = beginningBalance;
    interestEarnings[i] = grossGrowth;
    feeAmounts[i] = feeAmount;
    endingBalances[i] = endingBalance;

    priorBalance = endingBalance;
  }

  return { beginningBalances, interestEarnings, feeAmounts, endingBalances };
}

export function arithmeticMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Builds the dated cash-flow list for a money-weighted (XIRR-style) return
 * calculation "through" a given year index (Section 3.5): the starting
 * balance at t=0, each contribution at the start of its year (t = yearIndex - 1),
 * and the balance being solved for as a terminal outflow at t = throughYearIndex.
 */
export function buildCashFlowsThroughYear(
  startingBalance: number,
  contributions: number[],
  balanceAtYear: number,
  throughYearIndex: number,
): CashFlow[] {
  const cashFlows: CashFlow[] = [];
  if (startingBalance !== 0) {
    cashFlows.push({ t: 0, amount: startingBalance });
  }
  for (let j = 0; j < throughYearIndex; j++) {
    if (contributions[j] !== 0) {
      cashFlows.push({ t: j, amount: contributions[j] });
    }
  }
  cashFlows.push({ t: throughYearIndex, amount: -balanceAtYear });
  return cashFlows;
}

export function computeMoneyWeightedReturn(
  startingBalance: number,
  contributions: number[],
  balanceAtYear: number,
  throughYearIndex: number,
): number | null {
  const cashFlows = buildCashFlowsThroughYear(
    startingBalance,
    contributions,
    balanceAtYear,
    throughYearIndex,
  );
  return xirr(cashFlows);
}

export interface HistoricalReturnsRange {
  years: number[];
  priceReturns: number[];
  totalReturns: number[];
}

export interface ClampedHistoricalReturnsRange extends HistoricalReturnsRange {
  truncated: boolean;
  requestedYears: number;
}

/**
 * Like getHistoricalReturnsForRange, but clamps to however much historical
 * data is actually available instead of throwing — used by Phase 2's
 * multi-decade (up to 55-year) comparisons, where a starting year late enough
 * to run past the dataset's max year is expected and should degrade
 * gracefully (with truncated: true) rather than error out.
 */
export function getHistoricalReturnsForRangeClamped(
  startingYear: number,
  numberOfYears: number,
): ClampedHistoricalReturnsRange {
  const years: number[] = [];
  const priceReturns: number[] = [];
  const totalReturns: number[] = [];

  for (let i = 0; i < numberOfYears; i++) {
    const year = startingYear + i;
    const row = getAnnualReturn(year);
    if (!row) break;
    years.push(year);
    priceReturns.push(row.priceReturn);
    totalReturns.push(row.totalReturn);
  }

  return {
    years,
    priceReturns,
    totalReturns,
    truncated: years.length < numberOfYears,
    requestedYears: numberOfYears,
  };
}

export function getHistoricalReturnsForRange(
  startingYear: number,
  numberOfYears: number,
): HistoricalReturnsRange {
  const years: number[] = [];
  const priceReturns: number[] = [];
  const totalReturns: number[] = [];

  for (let i = 0; i < numberOfYears; i++) {
    const year = startingYear + i;
    const row = getAnnualReturn(year);
    if (!row) {
      throw new Error(
        `No historical S&P 500 return data available for ${year}. Data covers ${SP500_DATA_MIN_YEAR}-${SP500_DATA_MAX_YEAR}.`,
      );
    }
    years.push(year);
    priceReturns.push(row.priceReturn);
    totalReturns.push(row.totalReturn);
  }

  return { years, priceReturns, totalReturns };
}

/**
 * Phase 1's full accumulation simulation: real sequenced total returns vs. a
 * flat arithmetic-mean rate, both tracks fed through the same generic
 * compounding engine (Section 3.4-3.8).
 */
export function runSimulation(inputs: SimulationInputs): SimulationResult {
  const { startingYear, numberOfYears, startingBalance, annualContribution, managementFeePct, taxRatePct } =
    inputs;

  const { years, priceReturns, totalReturns } = getHistoricalReturnsForRange(startingYear, numberOfYears);

  const contributions = new Array(numberOfYears).fill(annualContribution);
  const averageRateUsed = arithmeticMean(totalReturns);
  const averageRates = new Array(numberOfYears).fill(averageRateUsed);

  const actualTrack = runBalanceTrack(startingBalance, contributions, totalReturns, managementFeePct);
  const averageTrack = runBalanceTrack(startingBalance, contributions, averageRates, managementFeePct);

  const rows: SimulationYearRow[] = years.map((year, i) => {
    const yearIndex = i + 1;
    return {
      year,
      yearIndex,
      beginningBalance: actualTrack.beginningBalances[i],
      contribution: contributions[i],
      priceReturn: priceReturns[i],
      totalReturn: totalReturns[i],
      avgRateUsed: averageRateUsed,
      interestEarnings: actualTrack.interestEarnings[i],
      feeAmount: actualTrack.feeAmounts[i],
      actualBalance: actualTrack.endingBalances[i],
      cagrActualToDate: computeMoneyWeightedReturn(
        startingBalance,
        contributions,
        actualTrack.endingBalances[i],
        yearIndex,
      ),
      averageBalance: averageTrack.endingBalances[i],
    };
  });

  const lastIndex = numberOfYears - 1;
  const totalContributed = startingBalance + annualContribution * numberOfYears;
  const finalActualValue = actualTrack.endingBalances[lastIndex] * (1 - taxRatePct);
  const finalAverageValue = averageTrack.endingBalances[lastIndex] * (1 - taxRatePct);
  const dollarDifference = finalAverageValue - finalActualValue;
  const percentDifference = finalActualValue !== 0 ? dollarDifference / finalActualValue : 0;

  const finalCagrActual = computeMoneyWeightedReturn(
    startingBalance,
    contributions,
    actualTrack.endingBalances[lastIndex],
    numberOfYears,
  );
  const finalCagrAverage = computeMoneyWeightedReturn(
    startingBalance,
    contributions,
    averageTrack.endingBalances[lastIndex],
    numberOfYears,
  );

  const baselineFeeTrack = runBalanceTrack(startingBalance, contributions, totalReturns, BASELINE_FEE_PCT);
  const feeImpactDollars = baselineFeeTrack.endingBalances[lastIndex] - actualTrack.endingBalances[lastIndex];

  return {
    rows,
    totalContributed,
    finalActualValue,
    finalAverageValue,
    dollarDifference,
    percentDifference,
    finalCagrActual,
    finalCagrAverage,
    averageRateUsed,
    managementFeePct,
    taxRatePct,
    feeImpactDollars,
  };
}

export interface ValidationError {
  field: string;
  message: string;
}

export function validateSimulationInputs(
  inputs: Partial<SimulationInputs>,
  currentYear: number = new Date().getFullYear(),
): ValidationError[] {
  const errors: ValidationError[] = [];
  const { startingYear, numberOfYears, startingBalance, annualContribution, managementFeePct, taxRatePct } =
    inputs;

  if (startingYear === undefined || Number.isNaN(startingYear)) {
    errors.push({ field: 'startingYear', message: 'Starting year is required.' });
  } else if (startingYear < SP500_DATA_MIN_YEAR || startingYear > currentYear - 1) {
    errors.push({
      field: 'startingYear',
      message: `Starting year must be between ${SP500_DATA_MIN_YEAR} and ${currentYear - 1}.`,
    });
  }

  if (numberOfYears === undefined || Number.isNaN(numberOfYears) || numberOfYears < 1) {
    errors.push({ field: 'numberOfYears', message: 'Number of years must be at least 1.' });
  } else if (startingYear !== undefined && startingYear + numberOfYears - 1 > currentYear - 1) {
    errors.push({
      field: 'numberOfYears',
      message: 'Starting year + number of years must not exceed the current year.',
    });
  } else if (startingYear !== undefined && startingYear + numberOfYears - 1 > SP500_DATA_MAX_YEAR) {
    errors.push({
      field: 'numberOfYears',
      message: `Historical data only extends through ${SP500_DATA_MAX_YEAR}.`,
    });
  }

  if ((startingBalance ?? 0) === 0 && (annualContribution ?? 0) === 0) {
    errors.push({
      field: 'startingBalance',
      message: 'Starting balance and annual contribution cannot both be $0.',
    });
  }

  if (startingBalance !== undefined && startingBalance < 0) {
    errors.push({ field: 'startingBalance', message: 'Starting balance cannot be negative.' });
  }

  if (annualContribution !== undefined && annualContribution < 0) {
    errors.push({ field: 'annualContribution', message: 'Annual contribution cannot be negative.' });
  }

  if (managementFeePct !== undefined && (managementFeePct < 0 || managementFeePct > 0.02)) {
    errors.push({ field: 'managementFeePct', message: 'Management fee must be between 0% and 2%.' });
  }

  if (taxRatePct !== undefined && (taxRatePct < 0 || taxRatePct > 0.5)) {
    errors.push({ field: 'taxRatePct', message: 'Tax rate must be between 0% and 50%.' });
  }

  return errors;
}
