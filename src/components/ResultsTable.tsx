import { useState } from 'react';
import type { SimulationYearRow } from '../types';
import { formatDollars, formatPercent, formatYear } from '../utils/formatters';

interface ResultsTableProps {
  rows: SimulationYearRow[];
}

type SortDirection = 'asc' | 'desc';

const columns: { key: keyof SimulationYearRow | 'index'; label: string }[] = [
  { key: 'year', label: 'Year' },
  { key: 'beginningBalance', label: 'Beg. of Year Amount' },
  { key: 'contribution', label: 'Contribution' },
  { key: 'priceReturn', label: 'S&P 500 Return (Price Only)' },
  { key: 'totalReturn', label: 'S&P 500 Return (Total Return)' },
  { key: 'avgRateUsed', label: 'Avg Rate Used' },
  { key: 'interestEarnings', label: 'Interest Earnings ($)' },
  { key: 'feeAmount', label: 'Fee ($)' },
  { key: 'actualBalance', label: 'My Actual Amount' },
  { key: 'cagrActualToDate', label: 'CAGR (Actual, to date)' },
  { key: 'averageBalance', label: 'Average-Rate Amount' },
];

export function ResultsTable({ rows }: ResultsTableProps) {
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const sortedRows = [...rows].sort((a, b) =>
    sortDirection === 'asc' ? a.year - b.year : b.year - a.year,
  );

  return (
    <section className="card overflow-hidden">
      <h2 className="border-b border-navy-700 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-400 sm:px-6">
        Year-by-Year Results
      </h2>
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-navy-800">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="whitespace-nowrap border-b border-navy-600 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                >
                  {col.key === 'year' ? (
                    <button
                      type="button"
                      className="flex items-center gap-1 hover:text-slate-200"
                      onClick={() => setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}
                    >
                      {col.label}
                      <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={row.year}
                className={
                  row.totalReturn < 0
                    ? 'bg-loss-500/10'
                    : row.totalReturn > 0
                      ? 'bg-gain-500/5'
                      : undefined
                }
              >
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5">
                  {formatYear(row.year)}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5">
                  {formatDollars(row.beginningBalance)}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5">
                  {formatDollars(row.contribution)}
                </td>
                <td
                  className={`whitespace-nowrap border-b border-navy-800 px-3 py-1.5 ${row.priceReturn < 0 ? 'text-loss-400' : 'text-gain-400'}`}
                >
                  {formatPercent(row.priceReturn)}
                </td>
                <td
                  className={`whitespace-nowrap border-b border-navy-800 px-3 py-1.5 ${row.totalReturn < 0 ? 'text-loss-400' : 'text-gain-400'}`}
                >
                  {formatPercent(row.totalReturn)}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-slate-400">
                  {formatPercent(row.avgRateUsed)}
                </td>
                <td
                  className={`whitespace-nowrap border-b border-navy-800 px-3 py-1.5 ${row.interestEarnings < 0 ? 'text-loss-400' : 'text-gain-400'}`}
                >
                  {formatDollars(row.interestEarnings)}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5">
                  {formatDollars(row.feeAmount)}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 font-medium text-slate-100">
                  {formatDollars(row.actualBalance)}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5">
                  {formatPercent(row.cagrActualToDate)}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-slate-400">
                  {formatDollars(row.averageBalance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
