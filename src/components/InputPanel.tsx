import { NumberField } from './NumberField';
import type { SimulationInputs } from '../types';
import type { ValidationError } from '../utils/calculations';

interface InputPanelProps {
  inputs: SimulationInputs;
  onChange: (inputs: SimulationInputs) => void;
  validationErrors: ValidationError[];
  minYear: number;
  maxYear: number;
}

function fieldError(errors: ValidationError[], field: string): string | undefined {
  return errors.find((e) => e.field === field)?.message;
}

export function InputPanel({ inputs, onChange, validationErrors, minYear, maxYear }: InputPanelProps) {
  const update = <K extends keyof SimulationInputs>(key: K, value: SimulationInputs[K]) => {
    onChange({ ...inputs, [key]: value });
  };

  return (
    <section className="rounded-lg border border-navy-700 bg-navy-900 p-4 sm:p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Starting Year" error={fieldError(validationErrors, 'startingYear')}>
          <NumberField
            className="input"
            min={minYear}
            max={maxYear}
            value={inputs.startingYear}
            onChange={(v) => update('startingYear', v)}
          />
        </Field>

        <Field label="Number of Years" error={fieldError(validationErrors, 'numberOfYears')}>
          <NumberField
            className="input"
            min={1}
            value={inputs.numberOfYears}
            onChange={(v) => update('numberOfYears', v)}
          />
        </Field>

        <Field label="Starting Balance" error={fieldError(validationErrors, 'startingBalance')}>
          <NumberField
            className="input"
            min={0}
            step={100}
            value={inputs.startingBalance}
            onChange={(v) => update('startingBalance', v)}
          />
        </Field>

        <Field label="Annual Contribution" error={fieldError(validationErrors, 'annualContribution')}>
          <NumberField
            className="input"
            min={0}
            step={100}
            value={inputs.annualContribution}
            onChange={(v) => update('annualContribution', v)}
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
      </div>
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
