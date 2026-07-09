import { ORIGINAL_FRONT_LOADED_PREMIUM } from '../../data/wholeLifeIllustration';
import { scaleRatioFromFrontLoadedPremium } from '../../utils/premiumScaling';

interface WholeLifeInputPanelProps {
  frontLoadedPremium: number;
  spStartingYear: number;
  onFrontLoadedPremiumChange: (value: number) => void;
  onSpStartingYearChange: (value: number) => void;
  minYear: number;
  maxStartingYearForFullWindow: number;
}

export function WholeLifeInputPanel({
  frontLoadedPremium,
  spStartingYear,
  onFrontLoadedPremiumChange,
  onSpStartingYearChange,
  minYear,
  maxStartingYearForFullWindow,
}: WholeLifeInputPanelProps) {
  const isOriginal = frontLoadedPremium === ORIGINAL_FRONT_LOADED_PREMIUM;

  return (
    <section className="card p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Whole Life Comparison Inputs
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
          <input
            type="number"
            className="input"
            min={1000}
            step={1000}
            value={frontLoadedPremium}
            onChange={(e) => onFrontLoadedPremiumChange(Number(e.target.value))}
          />
          <span className="text-xs text-slate-500">
            Original illustration: {ORIGINAL_FRONT_LOADED_PREMIUM.toLocaleString()}/yr. Sustaining-period
            premium (year 8+) scales with the same ratio.
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            S&amp;P 500 Comparison Starting Year
          </span>
          <input
            type="number"
            className="input"
            min={minYear}
            max={maxStartingYearForFullWindow}
            value={spStartingYear}
            onChange={(e) => onSpStartingYearChange(Number(e.target.value))}
          />
          <span className="text-xs text-slate-500">
            Real historical S&amp;P sequence, same 55-year funding schedule. Use{' '}
            {maxStartingYearForFullWindow} or earlier for a full 55-year window.
          </span>
        </label>

        <div className="flex flex-col justify-end text-xs text-slate-500">
          Scale ratio: {scaleRatioFromFrontLoadedPremium(frontLoadedPremium).toFixed(3)}×
        </div>
      </div>
    </section>
  );
}
