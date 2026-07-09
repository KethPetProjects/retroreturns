export interface AnnualReturn {
  year: number;
  priceReturn: number; // decimal, e.g. 0.0847 for 8.47%
  totalReturn: number; // decimal, includes dividends
}

/** A single dated cash flow used for XIRR solving. Positive = money in (contribution), negative = money out (withdrawal/terminal value). */
export interface CashFlow {
  /** Years since the first cash flow (t=0), fractional allowed */
  t: number;
  amount: number;
}

export interface SimulationInputs {
  startingYear: number;
  numberOfYears: number;
  startingBalance: number;
  annualContribution: number;
  managementFeePct: number; // decimal, e.g. 0.0003 for 0.03%
  taxRatePct: number; // decimal, e.g. 0.15 for 15%
}

export interface SimulationYearRow {
  year: number;
  yearIndex: number; // 1..N
  beginningBalance: number;
  contribution: number;
  priceReturn: number;
  totalReturn: number;
  avgRateUsed: number;
  interestEarnings: number;
  feeAmount: number;
  actualBalance: number;
  cagrActualToDate: number | null;
  averageBalance: number;
}

export interface SimulationResult {
  rows: SimulationYearRow[];
  totalContributed: number;
  finalActualValue: number;
  finalAverageValue: number;
  dollarDifference: number;
  percentDifference: number;
  finalCagrActual: number | null;
  finalCagrAverage: number | null;
  averageRateUsed: number;
  managementFeePct: number;
  taxRatePct: number;
  feeImpactDollars: number;
}

/** A generic contribution stream entry, used to drive the simulation engine with schedules other than a flat annual amount (e.g. Phase 2's 7-pay premium schedule). */
export interface ContributionScheduleEntry {
  yearIndex: number; // 1..N
  amount: number;
}
