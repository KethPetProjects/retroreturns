import { NumberField } from '../NumberField';
import { ORIGINAL_FRONT_LOADED_PREMIUM } from '../../data/wholeLifeIllustration';
import { scaleRatioFromFrontLoadedPremium } from '../../utils/premiumScaling';

interface WholeLifeInputPanelProps {
  frontLoadedPremium: number;
  onFrontLoadedPremiumChange: (value: number) => void;
}

export function WholeLifeInputPanel({ frontLoadedPremium, onFrontLoadedPremiumChange }: WholeLifeInputPanelProps) {
  const isOriginal = frontLoadedPremium === ORIGINAL_FRONT_LOADED_PREMIUM;

  return (
    <section className="card p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Whole Life Policy Inputs
        </h2>
        {!isOriginal && (
          <button
            type="button"
            className="rounded-md border border-navy-600 bg-navy-800 px-3 py-1 text-xs font-medium text-sky-400 hover:border-sky-600"
            onClick={() => onFrontLoadedPremiumChange(ORIGINAL_FRONT_LOADED_PREMIUM)}
          >
            Reset to original $20,000/yr illustration
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Annual Premium (Years 1-7)
          </span>
          <NumberField
            className="input"
            min={1000}
            step={1000}
            value={frontLoadedPremium}
            onChange={onFrontLoadedPremiumChange}
          />
          <span className="text-xs text-slate-500">
            Original illustration: {ORIGINAL_FRONT_LOADED_PREMIUM.toLocaleString()}/yr. Sustaining-period
            premium (year 8+) scales with the same ratio.
          </span>
        </label>

        <div className="flex flex-col justify-end gap-1 text-xs text-slate-500">
          <p>Scale ratio: {scaleRatioFromFrontLoadedPremium(frontLoadedPremium).toFixed(3)}×</p>
        </div>
      </div>
    </section>
  );
}
