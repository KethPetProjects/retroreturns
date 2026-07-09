import { useState } from 'react';
import { InputPanel } from './components/InputPanel';
import { GrowthChart } from './components/GrowthChart';
import { ResultsTable } from './components/ResultsTable';
import { SummarySection } from './components/SummarySection';
import { ErrorState } from './components/ErrorState';
import { DataSourceBanner } from './components/DataSourceBanner';
import { WholeLifeInputPanel } from './components/phase2/WholeLifeInputPanel';
import { PremiumScaleWarning } from './components/phase2/PremiumScaleWarning';
import { ComparisonChart } from './components/phase2/ComparisonChart';
import { WholeLifeSummary } from './components/phase2/WholeLifeSummary';
import { OpportunityCostCallout } from './components/phase2/OpportunityCostCallout';
import { CaveatsPanel } from './components/phase2/CaveatsPanel';
import { useHistoricalReturns } from './hooks/useHistoricalReturns';
import { useSimulation } from './hooks/useSimulation';
import { useWholeLifeComparison } from './hooks/useWholeLifeComparison';
import { ORIGINAL_FRONT_LOADED_PREMIUM, NON_APPUA_PREMIUM } from './data/wholeLifeIllustration';
import { scaleRatioFromFrontLoadedPremium } from './utils/premiumScaling';
import type { SimulationInputs } from './types';

const currentYear = new Date().getFullYear();

const DEFAULT_INPUTS: SimulationInputs = {
  startingYear: 1995,
  numberOfYears: 30,
  startingBalance: 10000,
  annualContribution: 6000,
  managementFeePct: 0.0003,
  taxRatePct: 0,
};

function App() {
  const [inputs, setInputs] = useState<SimulationInputs>(DEFAULT_INPUTS);
  const historicalReturns = useHistoricalReturns();
  const { result, validationErrors } = useSimulation(inputs);

  const [frontLoadedPremium, setFrontLoadedPremium] = useState(ORIGINAL_FRONT_LOADED_PREMIUM);
  const premiumScaleRatio = scaleRatioFromFrontLoadedPremium(frontLoadedPremium);
  // Locked to Phase 1's own Starting Year — the WL comparison's S&P side must
  // use the same real market history the user chose for the Accumulation
  // section, not an independently-set year (see App.tsx history for the
  // earlier, confusing two-starting-years version).
  const { result: wlResult } = useWholeLifeComparison({
    spStartingYear: inputs.startingYear,
    premiumScaleRatio,
    comparisonYears: inputs.numberOfYears,
  });

  return (
    <div className="min-h-screen bg-navy-950">
      <header className="border-b border-navy-800 bg-navy-900/60 px-4 py-6 sm:px-8">
        <h1 className="text-2xl font-bold text-slate-100 sm:text-3xl">RetroReturns</h1>
        <p className="mt-1 text-sm text-slate-400">
          What your S&amp;P 500 investment actually returned — not what the average implies.
        </p>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8">
        <DataSourceBanner
          source={historicalReturns.source}
          minYear={historicalReturns.minYear}
          maxYear={historicalReturns.maxYear}
        />

        <h2 className="text-lg font-semibold text-slate-200">Accumulation: S&amp;P 500 Actual vs. Average</h2>

        <InputPanel
          inputs={inputs}
          onChange={setInputs}
          validationErrors={validationErrors}
          minYear={historicalReturns.minYear}
          maxYear={currentYear - 1}
        />

        {validationErrors.length > 0 && (
          <ErrorState message={validationErrors.map((e) => e.message).join(' ')} />
        )}

        {result && (
          <>
            <GrowthChart rows={result.rows} />
            <ResultsTable rows={result.rows} />
            <SummarySection result={result} />
          </>
        )}

        <hr className="my-4 border-navy-800" />

        <h2 className="text-lg font-semibold text-slate-200">
          Whole Life Comparison: Penn Mutual Reference Illustration
        </h2>
        <p className="-mt-4 text-xs text-slate-500">
          Reference illustration — Penn Mutual, issue age 44, non-guaranteed values are not
          guaranteed and assume continuation of the current dividend scale.
        </p>

        <WholeLifeInputPanel
          frontLoadedPremium={frontLoadedPremium}
          spStartingYear={inputs.startingYear}
          onFrontLoadedPremiumChange={setFrontLoadedPremium}
          spDataTruncated={wlResult.spComparison.truncated}
          spYearsAvailable={wlResult.spComparison.years.length}
          comparisonYears={wlResult.comparisonYears}
        />

        {!wlResult.isOriginalPremium && <PremiumScaleWarning />}

        <ComparisonChart result={wlResult} />
        <WholeLifeSummary result={wlResult} />
        <OpportunityCostCallout
          result={wlResult}
          nonAppuaPremiumPerYear={NON_APPUA_PREMIUM * premiumScaleRatio}
        />
        <CaveatsPanel />
      </main>
    </div>
  );
}

export default App;
