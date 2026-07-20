import type { PreRetirementYearResult, WithdrawalYearResult } from '../../utils/distributionCalculations';
import { formatDollars, formatPercent, formatYear } from '../../utils/formatters';

interface DistributionTableProps {
  rows: WithdrawalYearResult[];
  stopWorkingAge: number;
  /** The same median trial's pre-retirement accumulation years (Current Age -> Stop-Working Age). Only present when Current Balance (lifecycle mode) is in use. */
  preRetirementRows?: PreRetirementYearResult[];
  currentAge: number;
}

const TOTAL_COLUMNS = 18;
// Pre-retirement rows only populate Year/Age/Beg. Balance/S&P Return/Contribution
// and Ending Balance; every retirement-only column in between (Gross
// Withdrawal through WL Loan Balance) is filled with this many "—" placeholders.
const RETIREMENT_ONLY_COLUMNS = 12;

export function DistributionTable({ rows, stopWorkingAge, preRetirementRows, currentAge }: DistributionTableProps) {
  return (
    <section className="card overflow-hidden">
      <h2 className="border-b border-navy-700 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-400 sm:px-6">
        Year-by-Year Results — Median Simulated Trial
      </h2>
      <p className="border-b border-navy-700 px-4 py-2 text-xs text-slate-500 sm:px-6">
        The exact real historical S&amp;P 500 annual returns randomly drawn for this one
        representative trial — not a summary or a smoothed average.
        {preRetirementRows && preRetirementRows.length > 0 && (
          <> Includes the pre-retirement accumulation years leading up to Stop-Working Age.</>
        )}
      </p>
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-navy-800">
            <tr>
              {[
                'Year',
                'Age',
                'Beg. Balance',
                'S&P Return',
                'Contribution',
                'Gross Withdrawal',
                'RMD?',
                'Social Security',
                'Other Income',
                'Reverse Mortgage',
                'LTC Cost',
                'Tax Owed',
                'Stock Balance',
                'Cash Balance',
                'Refilled?',
                'WL Cash Value',
                'WL Loan Balance',
                'Ending Balance',
              ].map((label) => (
                <th
                  key={label}
                  className="whitespace-nowrap border-b border-navy-600 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preRetirementRows?.map((row) => (
              <tr
                key={`pre-${row.year}`}
                className={`bg-sky-500/5 ${row.returnApplied < 0 ? 'bg-loss-500/10' : row.returnApplied > 0 ? 'bg-gain-500/5' : ''}`}
              >
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5">
                  {formatYear(row.year)}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-slate-400">
                  {currentAge + row.year - 1}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5">
                  {formatDollars(row.beginningBalance)}
                </td>
                <td
                  className={`whitespace-nowrap border-b border-navy-800 px-3 py-1.5 ${row.returnApplied < 0 ? 'text-loss-400' : 'text-gain-400'}`}
                >
                  {formatPercent(row.returnApplied)}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-sky-400">
                  {formatDollars(row.contribution)}
                </td>
                {Array.from({ length: RETIREMENT_ONLY_COLUMNS }).map((_, i) => (
                  <td key={i} className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-slate-600">
                    —
                  </td>
                ))}
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 font-medium text-slate-100">
                  {formatDollars(row.endingBalance)}
                </td>
              </tr>
            ))}
            {preRetirementRows && preRetirementRows.length > 0 && (
              <tr>
                <td
                  colSpan={TOTAL_COLUMNS}
                  className="whitespace-nowrap border-b border-navy-600 bg-navy-800/80 px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-400"
                >
                  Retirement Begins — Age {stopWorkingAge}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.year}
                className={
                  row.returnApplied < 0 ? 'bg-loss-500/10' : row.returnApplied > 0 ? 'bg-gain-500/5' : undefined
                }
              >
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5">
                  {formatYear((preRetirementRows?.length ?? 0) + row.year)}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-slate-400">
                  {stopWorkingAge + row.year - 1}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5">
                  {formatDollars(row.beginningBalance)}
                </td>
                <td
                  className={`whitespace-nowrap border-b border-navy-800 px-3 py-1.5 ${row.returnApplied < 0 ? 'text-loss-400' : 'text-gain-400'}`}
                >
                  {formatPercent(row.returnApplied)}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-slate-600">—</td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5">
                  {formatDollars(row.grossWithdrawal)}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-center text-amber-400">
                  {row.rmdApplied ? '✓' : ''}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-slate-400">
                  {row.socialSecurityIncome > 0 ? formatDollars(row.socialSecurityIncome) : '—'}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-slate-400">
                  {row.otherIncome > 0 ? formatDollars(row.otherIncome) : '—'}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-slate-400">
                  {row.reverseMortgageIncome > 0 ? formatDollars(row.reverseMortgageIncome) : '—'}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-loss-400">
                  {row.longTermCareCost > 0 ? formatDollars(row.longTermCareCost) : '—'}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-slate-400">
                  {formatDollars(row.taxOwed)}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5">
                  {formatDollars(row.stockBalance)}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-amber-400">
                  {formatDollars(row.cashBalance)}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-center">
                  {row.refilled ? '✓' : ''}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-slate-400">
                  {row.wholeLifeCashValueBalance > 0 ? formatDollars(row.wholeLifeCashValueBalance) : '—'}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 text-loss-400">
                  {row.wholeLifeLoanBalance > 0 ? formatDollars(row.wholeLifeLoanBalance) : '—'}
                </td>
                <td className="whitespace-nowrap border-b border-navy-800 px-3 py-1.5 font-medium text-slate-100">
                  {formatDollars(row.endingBalance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
