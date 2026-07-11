import { useState } from 'react';
import { InputPanel } from './components/InputPanel';
import { GrowthChart } from './components/GrowthChart';
import { ResultsTable } from './components/ResultsTable';
import { SummarySection } from './components/SummarySection';
import { ErrorState } from './components/ErrorState';
import { DataSourceBanner } from './components/DataSourceBanner';
import { TabBar } from './components/TabBar';
import { WholeLifeInputPanel } from './components/phase2/WholeLifeInputPanel';
import { PremiumScaleWarning } from './components/phase2/PremiumScaleWarning';
import { ComparisonChart } from './components/phase2/ComparisonChart';
import { WholeLifeSummary } from './components/phase2/WholeLifeSummary';
import { OpportunityCostCallout } from './components/phase2/OpportunityCostCallout';
import { CaveatsPanel } from './components/phase2/CaveatsPanel';
import { DistributionInputPanel } from './components/phase3/DistributionInputPanel';
import { DistributionChart } from './components/phase3/DistributionChart';
import { DistributionSummary } from './components/phase3/DistributionSummary';
import { DistributionTable } from './components/phase3/DistributionTable';
import { useHistoricalReturns } from './hooks/useHistoricalReturns';
import { useSimulation } from './hooks/useSimulation';
import { useWholeLifeComparison } from './hooks/useWholeLifeComparison';
import { useDistribution } from './hooks/useDistribution';
import { ORIGINAL_FRONT_LOADED_PREMIUM, NON_APPUA_PREMIUM } from './data/wholeLifeIllustration';
import { scaleRatioFromFrontLoadedPremium } from './utils/premiumScaling';
import { getActualBalanceAtRetirement } from './utils/distributionCalculations';
import type { SimulationInputs, DistributionInputs } from './types';

const currentYear = new Date().getFullYear();

const DEFAULT_INPUTS: SimulationInputs = {
  startingYear: 1995,
  numberOfYears: 30,
  startingBalance: 0,
  annualContribution: 10000,
  managementFeePct: 0.0003,
  taxRatePct: 0,
};

const DEFAULT_DISTRIBUTION_INPUTS: DistributionInputs = {
  currentAge: 35,
  stopWorkingAge: 65,
  planThroughAge: 95,
  annualExpense: 80000,
  inflationRatePct: 0.03,
  standardDeduction: 15000,
  federalTaxRatePct: 0.15,
  stateTaxRatePct: 0.05,
  managementFeePct: 0.0003,
  cashBucketYears: 2,
  cashInterestRatePct: 0.025,
  socialSecurityAnnualBenefit: 0,
  socialSecurityClaimingAge: 67,
  socialSecurityTaxablePortionPct: 0.85,
  otherAnnualIncome: 0,
  reverseMortgageAnnualIncome: 0,
};

function App() {
  const [activeTab, setActiveTab] = useState('accumulation');
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
    feePct: inputs.managementFeePct,
    taxRatePct: inputs.taxRatePct,
  });

  const [distributionInputs, setDistributionInputs] = useState<DistributionInputs>(DEFAULT_DISTRIBUTION_INPUTS);
  // Carries over Phase 1's PRE-TAX balance (actualBalance, not finalActualValue —
  // Phase 3 applies its own withdrawal-based tax treatment year by year, so
  // starting from an already-taxed lump sum would double-tax the money) at
  // whichever accumulation year corresponds to Stop-Working Age — not always
  // the final year. Retiring 27 years into a 30-year accumulation window uses
  // year 27's balance, not year 30's.
  const yearsIntoAccumulation = distributionInputs.stopWorkingAge - distributionInputs.currentAge;
  const startingBalanceActual = result
    ? (getActualBalanceAtRetirement(result.rows, yearsIntoAccumulation) ?? 0)
    : 0;
  const { result: distributionResult, validationErrors: distributionValidationErrors } = useDistribution({
    distributionInputs,
    startingBalanceActual,
    phase1: { startingYear: inputs.startingYear, numberOfYears: inputs.numberOfYears },
  });

  return (
    <div className="min-h-screen bg-navy-950">
      <header className="border-b border-navy-800 bg-navy-900/60 px-4 py-6 sm:px-8">
        <h1 className="text-2xl font-bold text-slate-100 sm:text-3xl">RetroReturns</h1>
        <p className="mt-1 text-sm text-slate-400">
          What your S&amp;P 500 investment actually returned — not what the average implies.
        </p>
      </header>

      <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-8">
        <TabBar
          tabs={[
            { id: 'accumulation', label: 'Accumulation' },
            { id: 'distribution', label: 'Distribution' },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </div>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8">
        <DataSourceBanner
          source={historicalReturns.source}
          minYear={historicalReturns.minYear}
          maxYear={historicalReturns.maxYear}
        />

        {activeTab === 'accumulation' && (
          <>
            <h2 className="text-lg font-semibold text-slate-200">
              Accumulation: S&amp;P 500 Actual vs. Average
            </h2>

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
              spFeePct={inputs.managementFeePct}
            />

            {!wlResult.isOriginalPremium && <PremiumScaleWarning />}

            <ComparisonChart result={wlResult} />
            <WholeLifeSummary result={wlResult} />
            <OpportunityCostCallout
              result={wlResult}
              nonAppuaPremiumPerYear={NON_APPUA_PREMIUM * premiumScaleRatio}
            />
            <CaveatsPanel />
          </>
        )}

        {activeTab === 'distribution' && (
          <>
            <h2 className="text-lg font-semibold text-slate-200">
              Distribution: How Long Will It Last?
            </h2>
            <p className="-mt-4 text-xs text-slate-500">
              Starting balances carry over automatically from the Accumulation tab's ending
              balances (pre-tax) — switch to that tab to change the accumulation assumptions.
            </p>

            {!result && (
              <ErrorState message="Fix the Accumulation tab's inputs first — Distribution needs a valid ending balance to carry over." />
            )}

            {result && (
              <>
                <DistributionInputPanel
                  inputs={distributionInputs}
                  onChange={setDistributionInputs}
                  validationErrors={distributionValidationErrors}
                />

                {distributionValidationErrors.length > 0 && (
                  <ErrorState
                    message={distributionValidationErrors.map((e) => e.message).join(' ')}
                  />
                )}

                {distributionResult && (
                  <>
                    <DistributionChart
                      result={distributionResult}
                      stopWorkingAge={distributionInputs.stopWorkingAge}
                    />
                    <DistributionTable
                      rows={distributionResult.monteCarlo.medianTrialRows}
                      stopWorkingAge={distributionInputs.stopWorkingAge}
                    />
                    <DistributionSummary
                      result={distributionResult}
                      stopWorkingAge={distributionInputs.stopWorkingAge}
                      planThroughAge={distributionInputs.planThroughAge}
                    />
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
