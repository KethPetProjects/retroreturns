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

export interface DistributionInputs {
  currentAge: number;
  stopWorkingAge: number;
  planThroughAge: number;
  annualExpense: number; // net (take-home) year-1 spend target
  inflationRatePct: number;
  standardDeduction: number; // year-1 dollars, grows with inflation
  federalTaxRatePct: number;
  /** Combined with federalTaxRatePct into one flat rate above the standard deduction — a simplification of real state tax rules (own brackets/deductions), not a full state tax model. */
  stateTaxRatePct: number;
  managementFeePct: number;
  /** Years of upcoming withdrawals held in cash, drawn down first so stocks aren't sold in a downturn. 0 disables the bucket entirely. */
  cashBucketYears: number;
  /** Money-market interest rate earned on the cash bucket — fixed, not tied to historical volatility (real money-market funds don't crash the way stocks/bonds can). */
  cashInterestRatePct: number;
  /** Today's-dollars annual Social Security benefit, starting at socialSecurityClaimingAge and inflating from there. 0 disables it. */
  socialSecurityAnnualBenefit: number;
  /** Age Social Security starts — independent of Stop-Working Age, since many people delay claiming past when they stop working. */
  socialSecurityClaimingAge: number;
  /** Simplified flat stand-in for the real up-to-85%-taxable sliding-scale IRS rule on Social Security. */
  socialSecurityTaxablePortionPct: number;
  /** Other taxable income (rental, dividends outside the main account, etc.), today's dollars, starting at Stop-Working Age and inflating. */
  otherAnnualIncome: number;
  /**
   * Reverse mortgage draw, starting at Stop-Working Age, held FLAT in
   * nominal dollars for the rest of the horizon (no inflation adjustment) —
   * matching how a real reverse mortgage "tenure payment" works, unlike
   * Social Security/Other Income. Treated as tax-free income (real reverse
   * mortgage proceeds are loan proceeds, not taxable). Deliberately
   * simplified: no home value, no loan balance, no interest accrual
   * tracked. Placeholder pending the same dedicated treatment Phase 4 is
   * getting for whole life loans.
   */
  reverseMortgageAnnualIncome: number;
  /** Extra annual spending need (today's dollars) for active/assisted/skilled care, added on top of Annual Expense starting at Long-Term Care Start Age. 0 disables it entirely. */
  longTermCareAnnualCost: number;
  /** Age Long-Term Care costs start — independent of Stop-Working Age and Plan Through Age. Runs through the rest of the plan once started (no separate end age). */
  longTermCareStartAge: number;
  /** Own inflation rate for Long-Term Care costs, separate from and typically higher than the general Inflation Adjustment rate — real LTC/care costs have historically outpaced general inflation. */
  longTermCareInflationRatePct: number;
}
