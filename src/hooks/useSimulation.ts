import { useEffect, useMemo, useState } from 'react';
import { runSimulation, validateSimulationInputs, type ValidationError } from '../utils/calculations';
import type { SimulationInputs, SimulationResult } from '../types';

const DEBOUNCE_MS = 300;

export interface UseSimulationResult {
  result: SimulationResult | null;
  validationErrors: ValidationError[];
  isPending: boolean;
}

/**
 * Debounces raw input changes (Section 3.1: live recalculation, 300ms debounce)
 * and runs Phase 1's simulation engine. Kept as a standalone hook (rather than
 * inlined in App.tsx) so the same debounce/validate/compute pattern can be
 * reused by a future Distribution tab's hook without copy-pasting this logic.
 */
export function useSimulation(inputs: SimulationInputs): UseSimulationResult {
  const [debounced, setDebounced] = useState(inputs);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    setIsPending(true);
    const handle = setTimeout(() => {
      setDebounced(inputs);
      setIsPending(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    inputs.startingYear,
    inputs.numberOfYears,
    inputs.startingBalance,
    inputs.annualContribution,
    inputs.managementFeePct,
    inputs.taxRatePct,
  ]);

  const validationErrors = useMemo(() => validateSimulationInputs(debounced), [debounced]);

  const result = useMemo<SimulationResult | null>(() => {
    if (validationErrors.length > 0) return null;
    try {
      return runSimulation(debounced);
    } catch {
      return null;
    }
  }, [debounced, validationErrors]);

  return { result, validationErrors, isPending };
}
