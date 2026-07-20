import { NumberField } from '../NumberField';
import { SP500_DATA_MIN_YEAR, SP500_DATA_MAX_YEAR } from '../../data/sp500Fallback';
import type { DistributionInputs } from '../../types';
import type { DistributionValidationError } from '../../utils/distributionCalculations';

interface DistributionInputPanelProps {
  inputs: DistributionInputs;
  onChange: (inputs: DistributionInputs) => void;
  validationErrors: DistributionValidationError[];
}

function fieldError(errors: DistributionValidationError[], field: string): string | undefined {
  return errors.find((e) => e.field === field)?.message;
}

export function DistributionInputPanel({ inputs, onChange, validationErrors }: DistributionInputPanelProps) {
  const update = <K extends keyof DistributionInputs>(key: K, value: DistributionInputs[K]) => {
    onChange({ ...inputs, [key]: value });
  };

  return (
    <section className="card p-4 sm:p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Current Age" error={fieldError(validationErrors, 'currentAge')}>
          <NumberField className="input" min={0} value={inputs.currentAge} onChange={(v) => update('currentAge', v)} />
        </Field>

        <Field label="Stop-Working Age" error={fieldError(validationErrors, 'stopWorkingAge')}>
          <NumberField
            className="input"
            min={1}
            value={inputs.stopWorkingAge}
            onChange={(v) => update('stopWorkingAge', v)}
          />
        </Field>

        <Field label="Plan Through Age" error={fieldError(validationErrors, 'planThroughAge')}>
          <NumberField
            className="input"
            min={1}
            value={inputs.planThroughAge}
            onChange={(v) => update('planThroughAge', v)}
          />
        </Field>

        <Field label="Current Balance ($, today)" error={fieldError(validationErrors, 'currentBalance')}>
          <NumberField
            className="input"
            min={0}
            step={10000}
            value={inputs.currentBalance}
            onChange={(v) => update('currentBalance', v)}
          />
        </Field>

        <Field
          label="Pre-Retirement Annual Contribution ($)"
          error={fieldError(validationErrors, 'preRetirementAnnualContribution')}
        >
          <NumberField
            className="input"
            min={0}
            step={1000}
            value={inputs.preRetirementAnnualContribution}
            onChange={(v) => update('preRetirementAnnualContribution', v)}
          />
        </Field>

        <Field
          label="Starting Balance Override ($)"
          error={fieldError(validationErrors, 'startingBalanceOverride')}
        >
          <NumberField
            className="input"
            min={0}
            step={10000}
            value={inputs.startingBalanceOverride}
            onChange={(v) => update('startingBalanceOverride', v)}
          />
        </Field>

        <Field label="Annual Expense ($, net)" error={fieldError(validationErrors, 'annualExpense')}>
          <NumberField
            className="input"
            min={0}
            step={1000}
            value={inputs.annualExpense}
            onChange={(v) => update('annualExpense', v)}
          />
        </Field>

        <Field label="Inflation Adjustment (%)">
          <NumberField
            className="input"
            min={0}
            max={10}
            step={0.1}
            decimal
            value={inputs.inflationRatePct * 100}
            onChange={(v) => update('inflationRatePct', v / 100)}
          />
        </Field>

        <Field label="Standard Deduction ($)" error={fieldError(validationErrors, 'standardDeduction')}>
          <NumberField
            className="input"
            min={0}
            step={500}
            value={inputs.standardDeduction}
            onChange={(v) => update('standardDeduction', v)}
          />
        </Field>

        <Field label="Federal Tax Rate (%)" error={fieldError(validationErrors, 'federalTaxRatePct')}>
          <NumberField
            className="input"
            min={0}
            max={50}
            step={0.5}
            decimal
            value={inputs.federalTaxRatePct * 100}
            onChange={(v) => update('federalTaxRatePct', v / 100)}
          />
        </Field>

        <Field label="State Tax Rate (%)" error={fieldError(validationErrors, 'stateTaxRatePct')}>
          <NumberField
            className="input"
            min={0}
            max={15}
            step={0.5}
            decimal
            value={inputs.stateTaxRatePct * 100}
            onChange={(v) => update('stateTaxRatePct', v / 100)}
          />
        </Field>

        <Field label="Management Fee (%)" error={fieldError(validationErrors, 'managementFeePct')}>
          <NumberField
            className="input"
            min={0}
            max={2}
            step={0.01}
            decimal
            value={inputs.managementFeePct * 100}
            onChange={(v) => update('managementFeePct', v / 100)}
          />
        </Field>

        <Field label="Cash Bucket (years of expenses)" error={fieldError(validationErrors, 'cashBucketYears')}>
          <NumberField
            className="input"
            min={0}
            max={10}
            step={1}
            value={inputs.cashBucketYears}
            onChange={(v) => update('cashBucketYears', v)}
          />
        </Field>

        <Field
          label="Cash Bucket Interest Rate (%)"
          error={fieldError(validationErrors, 'cashInterestRatePct')}
        >
          <NumberField
            className="input"
            min={0}
            max={10}
            step={0.25}
            decimal
            value={inputs.cashInterestRatePct * 100}
            onChange={(v) => update('cashInterestRatePct', v / 100)}
          />
        </Field>

        <Field
          label="Social Security Annual Benefit ($)"
          error={fieldError(validationErrors, 'socialSecurityAnnualBenefit')}
        >
          <NumberField
            className="input"
            min={0}
            step={1000}
            value={inputs.socialSecurityAnnualBenefit}
            onChange={(v) => update('socialSecurityAnnualBenefit', v)}
          />
        </Field>

        <Field
          label="Social Security Claiming Age"
          error={fieldError(validationErrors, 'socialSecurityClaimingAge')}
        >
          <NumberField
            className="input"
            min={0}
            max={100}
            value={inputs.socialSecurityClaimingAge}
            onChange={(v) => update('socialSecurityClaimingAge', v)}
          />
        </Field>

        <Field
          label="Social Security Taxable Portion (%)"
          error={fieldError(validationErrors, 'socialSecurityTaxablePortionPct')}
        >
          <NumberField
            className="input"
            min={0}
            max={100}
            step={5}
            decimal
            value={inputs.socialSecurityTaxablePortionPct * 100}
            onChange={(v) => update('socialSecurityTaxablePortionPct', v / 100)}
          />
        </Field>

        <Field label="Other Annual Income ($)" error={fieldError(validationErrors, 'otherAnnualIncome')}>
          <NumberField
            className="input"
            min={0}
            step={1000}
            value={inputs.otherAnnualIncome}
            onChange={(v) => update('otherAnnualIncome', v)}
          />
        </Field>

        <Field
          label="Reverse Mortgage Annual Income ($)"
          error={fieldError(validationErrors, 'reverseMortgageAnnualIncome')}
        >
          <NumberField
            className="input"
            min={0}
            step={1000}
            value={inputs.reverseMortgageAnnualIncome}
            onChange={(v) => update('reverseMortgageAnnualIncome', v)}
          />
        </Field>

        <Field
          label="Long-Term Care Annual Cost ($)"
          error={fieldError(validationErrors, 'longTermCareAnnualCost')}
        >
          <NumberField
            className="input"
            min={0}
            step={1000}
            value={inputs.longTermCareAnnualCost}
            onChange={(v) => update('longTermCareAnnualCost', v)}
          />
        </Field>

        <Field label="Long-Term Care Start Age" error={fieldError(validationErrors, 'longTermCareStartAge')}>
          <NumberField
            className="input"
            min={0}
            max={100}
            value={inputs.longTermCareStartAge}
            onChange={(v) => update('longTermCareStartAge', v)}
          />
        </Field>

        <Field
          label="Long-Term Care Inflation Rate (%)"
          error={fieldError(validationErrors, 'longTermCareInflationRatePct')}
        >
          <NumberField
            className="input"
            min={0}
            max={20}
            step={0.5}
            decimal
            value={inputs.longTermCareInflationRatePct * 100}
            onChange={(v) => update('longTermCareInflationRatePct', v / 100)}
          />
        </Field>

        <Field
          label="Historical Data Start Year"
          error={fieldError(validationErrors, 'historicalDataStartYear')}
        >
          <NumberField
            className="input"
            min={SP500_DATA_MIN_YEAR}
            max={SP500_DATA_MAX_YEAR - 9}
            value={inputs.historicalDataStartYear}
            onChange={(v) => update('historicalDataStartYear', v)}
          />
        </Field>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Three ways to set Distribution's starting balance, in priority order. <strong>Current
        Balance</strong> (highest priority): enter what you actually have saved today, plus what
        you'll keep contributing until Stop-Working Age, and the simulation projects it forward
        itself — using the same randomized market sequence as the withdrawal phase, so a rough
        decade right before you retire also shapes what happens after. <strong>Starting Balance
        Override</strong> (used only if Current Balance is $0): enter a known figure directly if
        you already have a retirement-age estimate from elsewhere. Otherwise, the balance carries
        over from the Accumulation tab automatically. All three exist because Accumulation's clean
        single-contribution-stream model rarely matches how people actually saved (started late,
        paused to buy a house, changed contribution amounts over time). Setting either Current
        Balance or Starting Balance Override also frees up Stop-Working Age to be set independently
        of the Accumulation tab's Starting Year/Number of Years window, since that dollar figure is
        no longer being used.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Annual Expense is the take-home amount you want to actually spend — each year's withdrawal is
        grossed up above the standard deduction so that, after tax, you net this amount (adjusted for
        inflation).
      </p>
      <p className="mt-1 text-xs text-slate-500">
        The portfolio stays 100% S&amp;P 500. Cash Bucket holds that many years of upcoming
        withdrawals in a separate money-market account, drawn down first — so ordinary spending
        never forces a stock sale. The bucket is only topped back up from stocks in years the
        market was up; in down years it just drains, which is the whole point (it protects you
        from selling stocks low). Set to 0 to disable and withdraw straight from stocks.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Social Security, Other Income, and Reverse Mortgage all reduce how much needs to be
        withdrawn from the portfolio each year. Social Security starts at its own Claiming Age
        (independent of Stop-Working Age) and only a flat percentage of it counts as taxable
        income — a simplification of the real up-to-85%-taxable sliding scale. Federal and State
        Tax Rate are combined into one flat rate applied to portfolio withdrawals, the taxable
        portion of Social Security, and Other Income together, above one Standard Deduction — the
        same pooled way a real tax return works. Reverse Mortgage is treated as a simple tax-free
        income stream held flat in nominal dollars — no inflation adjustment, matching how a real
        reverse mortgage tenure payment works (no home value, loan balance, or interest accrual
        tracked) — a placeholder pending the same dedicated treatment planned for whole life
        policy loans.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Long-Term Care Annual Cost adds extra spending on top of Annual Expense starting at Long-Term
        Care Start Age, growing at its own (typically higher) inflation rate for the rest of the plan.
        Set the cost to $0 to disable it entirely. This models active/assisted/skilled care as one flat
        ongoing cost rather than distinct stages, and assumes everyone incurs it from that age onward —
        a simplification of real long-term care risk, which is much more variable (many people never
        need it, some need many years of expensive skilled nursing care).
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Required Minimum Distributions (RMDs) are always modeled — no separate input needed. Starting
        at age 73 or 75 (per SECURE 2.0, derived from Current Age), each year's withdrawal is forced up
        to the IRS-required minimum whenever that's larger than what the expense/LTC plan alone would
        withdraw. Assumes the whole portfolio is a tax-deferred account, matching this tool's
        401(k)-style framing.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Historical Data Start Year restricts the simulation to real market years on or after this
        year — e.g. set to 1960 to exclude the 1928–1958 era's unusually wide single-year swings
        (several real years above +40%, balanced by real crashes like 1931's −43%). Every sampled
        return is still real, unaltered historical data; this only changes which real years are
        eligible to be drawn, not the values themselves. Leave at the earliest available year to use
        the full dataset.
      </p>
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {error && <span className="text-xs text-loss-400">{error}</span>}
    </label>
  );
}
