const dollarFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dollarFormatterNoDecimals = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatDollars(value: number, decimals: boolean = true): string {
  return decimals ? dollarFormatter.format(value) : dollarFormatterNoDecimals.format(value);
}

/** value is a decimal, e.g. 0.0847 -> "8.47%" */
export function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatYear(year: number): string {
  return String(Math.trunc(year));
}
