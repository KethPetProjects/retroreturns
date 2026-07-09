import { describe, it, expect } from 'vitest';
import { xirr } from '../xirr';

describe('xirr', () => {
  it('solves a simple lump-sum case against the closed-form CAGR', () => {
    // $1,000 invested at t=0, worth $2,000 at t=10 years -> (2000/1000)^(1/10) - 1
    const expected = Math.pow(2, 1 / 10) - 1;
    const result = xirr([
      { t: 0, amount: 1000 },
      { t: 10, amount: -2000 },
    ]);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(expected, 6);
  });

  it('recovers the exact flat rate for an annuity-due contribution stream', () => {
    // $1,000 contributed at the start of each of 5 years, every year compounding at exactly 8%.
    // FV of an annuity due = C * [((1+r)^n - 1) / r] * (1+r)
    const rate = 0.08;
    const n = 5;
    const contribution = 1000;
    const fv = contribution * ((Math.pow(1 + rate, n) - 1) / rate) * (1 + rate);

    const cashFlows = [
      { t: 0, amount: 1000 },
      { t: 1, amount: 1000 },
      { t: 2, amount: 1000 },
      { t: 3, amount: 1000 },
      { t: 4, amount: 1000 },
      { t: 5, amount: -fv },
    ];

    const result = xirr(cashFlows);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(rate, 6);
  });

  it('returns a lower rate than naive end/start CAGR when a large late contribution is added', () => {
    // Naive CAGR = (end/start)^(1/n) - 1 badly overstates return when most money
    // arrived late and had little time to compound — this is the exact problem
    // Section 3.5 of the requirements doc calls out.
    const startingBalance = 1000;
    const lateContribution = 50000; // arrives at t=9, one year before the end
    const endingBalance = 60000;
    const n = 10;

    const naiveCagr = Math.pow(endingBalance / startingBalance, 1 / n) - 1;

    const result = xirr([
      { t: 0, amount: startingBalance },
      { t: 9, amount: lateContribution },
      { t: 10, amount: -endingBalance },
    ]);

    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(naiveCagr);
  });

  it('returns null when all cash flows have the same sign (no valid IRR)', () => {
    const result = xirr([
      { t: 0, amount: 1000 },
      { t: 1, amount: 500 },
      { t: 2, amount: 200 },
    ]);
    expect(result).toBeNull();
  });

  it('returns null for fewer than two cash flows', () => {
    expect(xirr([{ t: 0, amount: 1000 }])).toBeNull();
    expect(xirr([])).toBeNull();
  });

  it('handles a negative-return scenario (loss) correctly', () => {
    // $10,000 invested, worth only $8,000 five years later -> negative IRR
    const result = xirr([
      { t: 0, amount: 10000 },
      { t: 5, amount: -8000 },
    ]);
    expect(result).not.toBeNull();
    const expected = Math.pow(8000 / 10000, 1 / 5) - 1;
    expect(result!).toBeCloseTo(expected, 6);
    expect(result!).toBeLessThan(0);
  });

  it('matches a known multi-cash-flow reference case (Excel XIRR example)', () => {
    // Classic Excel XIRR documentation example, dates converted to year-fractions
    // from the first cash flow (Actual/365). Expected result: ~37.34%.
    const start = new Date('2008-01-01').getTime();
    const toYears = (dateStr: string) =>
      (new Date(dateStr).getTime() - start) / (1000 * 60 * 60 * 24 * 365);

    const cashFlows = [
      { t: toYears('2008-01-01'), amount: -10000 },
      { t: toYears('2008-03-01'), amount: 2750 },
      { t: toYears('2008-10-30'), amount: 4250 },
      { t: toYears('2009-02-15'), amount: 3250 },
      { t: toYears('2009-04-01'), amount: 2750 },
    ];

    const result = xirr(cashFlows);
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(0.3734, 2);
  });
});
