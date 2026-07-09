import type { HistoricalDataSource } from '../hooks/useHistoricalReturns';

interface DataSourceBannerProps {
  source: HistoricalDataSource;
  minYear: number;
  maxYear: number;
}

export function DataSourceBanner({ source, minYear, maxYear }: DataSourceBannerProps) {
  if (source !== 'reference-dataset') return null;

  return (
    <div className="rounded-md border border-sky-800/50 bg-sky-950/40 px-4 py-2.5 text-xs text-sky-300">
      <span className="font-semibold">Reference dataset in use:</span> S&P 500 annual returns (
      {minYear}–{maxYear}), price-only and total-return, sourced from Aswath Damodaran's (NYU
      Stern) historical returns dataset. No live market data API is connected in this build.
    </div>
  );
}
