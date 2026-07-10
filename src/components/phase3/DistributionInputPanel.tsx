import { NumberField } from '../NumberField';
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

        <Field label="Tax Rate (%)" error={fieldError(validationErrors, 'taxRatePct')}>
          <NumberField
            className="input"
            min={0}
            max={50}
            step={0.5}
            decimal
            value={inputs.taxRatePct * 100}
            onChange={(v) => update('taxRatePct', v / 100)}
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
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Annual Expense is the take-home amount you want to actually spend — each year's withdrawal is
        grossed up above the standard deduction so that, after tax, you net this amount (adjusted for
        inflation).
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
