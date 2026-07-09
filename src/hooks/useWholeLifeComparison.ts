import { useEffect, useMemo, useState } from 'react';
import {
  runWholeLifeComparison,
  type WholeLifeComparisonInputs,
  type WholeLifeComparisonResult,
} from '../utils/wholeLifeCalculations';

const DEBOUNCE_MS = 300;

export interface UseWholeLifeComparisonResult {
  result: WholeLifeComparisonResult;
  isPending: boolean;
}

/**
 * Debounced Phase 2 comparison hook, mirroring useSimulation's pattern
 * (Section 3.1's 300ms live-recalculation behavior applied to the whole life
 * comparison inputs: premium scale and the S&P comparison starting year).
 */
export function useWholeLifeComparison(inputs: WholeLifeComparisonInputs): UseWholeLifeComparisonResult {
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
  }, [inputs.spStartingYear, inputs.premiumScaleRatio]);

  const result = useMemo(() => runWholeLifeComparison(debounced), [debounced]);

  return { result, isPending };
}
