import { useEffect, useMemo, useState } from 'react';
import {
  runDistributionComparison,
  validateDistributionInputs,
  type DistributionComparisonResult,
  type DistributionValidationError,
} from '../utils/distributionCalculations';
import type { DistributionInputs } from '../types';

const DEBOUNCE_MS = 300;

export interface UseDistributionArgs {
  distributionInputs: DistributionInputs;
  startingBalanceActual: number;
  startingBalanceAverage: number;
  averageRateUsed: number;
  phase1: { startingYear: number; numberOfYears: number };
}

export interface UseDistributionResult {
  result: DistributionComparisonResult | null;
  validationErrors: DistributionValidationError[];
  isPending: boolean;
}

/**
 * Debounced Phase 3 hook, mirroring useSimulation/useWholeLifeComparison's
 * pattern (Section 3.1's 300ms live-recalculation behavior).
 */
export function useDistribution(args: UseDistributionArgs): UseDistributionResult {
  const [debounced, setDebounced] = useState(args);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    setIsPending(true);
    const handle = setTimeout(() => {
      setDebounced(args);
      setIsPending(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    args.distributionInputs.currentAge,
    args.distributionInputs.stopWorkingAge,
    args.distributionInputs.planThroughAge,
    args.distributionInputs.annualExpense,
    args.distributionInputs.inflationRatePct,
    args.distributionInputs.standardDeduction,
    args.distributionInputs.taxRatePct,
    args.distributionInputs.managementFeePct,
    args.startingBalanceActual,
    args.startingBalanceAverage,
    args.averageRateUsed,
    args.phase1.startingYear,
    args.phase1.numberOfYears,
  ]);

  const validationErrors = useMemo(
    () => validateDistributionInputs(debounced.distributionInputs, debounced.phase1),
    [debounced],
  );

  const result = useMemo<DistributionComparisonResult | null>(() => {
    if (validationErrors.length > 0) return null;
    try {
      return runDistributionComparison({
        startingBalanceActual: debounced.startingBalanceActual,
        startingBalanceAverage: debounced.startingBalanceAverage,
        averageRateUsed: debounced.averageRateUsed,
        distributionInputs: debounced.distributionInputs,
      });
    } catch {
      return null;
    }
  }, [debounced, validationErrors]);

  return { result, validationErrors, isPending };
}
