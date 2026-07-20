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
  /**
   * Optional manual starting balance for Distribution, in today's dollars,
   * treated as the balance AT Stop-Working Age. When greater than 0, this
   * replaces the balance otherwise carried over from the Accumulation tab's
   * simulated result — useful because real savings histories rarely match
   * Accumulation's clean single-contribution-stream model (people start
   * late, pause to buy a house, change contribution amounts, etc.). 0
   * (the default) keeps using the Accumulation tab's carried-over balance.
   */
  startingBalanceOverride: number;
  /**
   * What you actually have TODAY (401k/IRA balance), in today's dollars —
   * NOT projected. When greater than 0, Distribution projects this forward
   * to Stop-Working Age itself, using the SAME per-trial randomized market
   * sequence as the withdrawal phase (correlating pre- and post-retirement
   * conditions rather than treating "balance at retirement" as one fixed
   * number). Takes priority over both Starting Balance Override and the
   * Accumulation tab's carried-over balance. 0 (the default) disables this
   * entirely.
   */
  currentBalance: number;
  /** Flat nominal annual contribution from Current Age until Stop-Working Age (does not inflate, matching Phase 1's convention). Only relevant when currentBalance > 0. */
  preRetirementAnnualContribution: number;
  /**
   * Restricts the Monte Carlo return pool to real historical years >= this
   * year (e.g. 1960 excludes the 1928-1958 era's outlier single-year swings
   * — several real years above +40%, balanced by real crashes like 1931's
   * -43%). Every sampled value is still real, unaltered historical data —
   * this changes WHICH years feed the simulation, not the values
   * themselves. Defaults to the dataset's earliest year (no restriction).
   */
  historicalDataStartYear: number;
  /**
   * Years per resampled block in the Monte Carlo block bootstrap (13.4) —
   * instead of picking each year independently, the simulation repeatedly
   * picks a random contiguous slice of this many REAL consecutive
   * historical years (in their real order). Larger values preserve more of
   * a real bull/bear cycle intact but leave fewer distinct starting points
   * to draw from (less trial-to-trial variety); smaller values do the
   * opposite. Defaults to 7 years.
   */
  blockLengthYears: number;
  /**
   * Fraction (0-1) of the portfolio that's a Roth IRA/401k — tax-free on
   * withdrawal, and excluded from Required Minimum Distributions (Roths
   * aren't subject to RMDs for the original owner). Assumes a proportional
   * draw from both pots every year, not strategic Traditional-first/
   * Roth-first sequencing. 0 (the default) treats the whole portfolio as
   * tax-deferred, matching the tool's existing 401(k)-style framing.
   */
  rothPortfolioPct: number;
  /**
   * Cash value of a whole life insurance policy at retirement ($), used as a
   * third-tier buffer asset (after the cash bucket) during down years — see
   * 13.13. Modeled as a separate asset from the stock/cash portfolio, not
   * folded into the starting balance. 0 (the default) disables the buffer
   * entirely, matching prior behavior.
   */
  wholeLifeCashValueAtRetirement: number;
  /**
   * Annual growth rate (0-1) applied to the whole life cash value every
   * year, regardless of stock market returns (13.13). Defaults to 4.5%.
   */
  wholeLifeCashValueGrowthRatePct: number;
  /**
   * Annual interest rate (0-1) charged on an outstanding whole life policy
   * loan (13.13). Loans are drawn from the cash value in down years once
   * the cash bucket is exhausted, and repaid from stock gains in up years
   * before the cash bucket is refilled. Defaults to 6%.
   */
  wholeLifeLoanInterestRatePct: number;
}
