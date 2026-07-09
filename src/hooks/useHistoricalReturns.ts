import { SP500_FALLBACK_DATA, SP500_DATA_MIN_YEAR, SP500_DATA_MAX_YEAR } from '../data/sp500Fallback';
import type { AnnualReturn } from '../types';

export type HistoricalDataSource = 'reference-dataset';

export interface HistoricalReturnsState {
  data: AnnualReturn[];
  isLoading: boolean;
  error: string | null;
  source: HistoricalDataSource;
  minYear: number;
  maxYear: number;
}

/**
 * Historical S&P 500 return data access point. This build uses the hardcoded
 * reference dataset as the sole source (no live API — see README). It's kept
 * as a hook, separate from importing sp500Fallback.ts directly in components,
 * so a live-fetch + localStorage-cache layer (Section 3.3 Option A/B) can be
 * added later behind this same interface without touching any callers.
 */
export function useHistoricalReturns(): HistoricalReturnsState {
  return {
    data: SP500_FALLBACK_DATA,
    isLoading: false,
    error: null,
    source: 'reference-dataset',
    minYear: SP500_DATA_MIN_YEAR,
    maxYear: SP500_DATA_MAX_YEAR,
  };
}
