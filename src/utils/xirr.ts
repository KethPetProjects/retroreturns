import type { CashFlow } from '../types';

const MAX_NEWTON_ITERATIONS = 100;
const NEWTON_TOLERANCE = 1e-9;
const MAX_BISECTION_ITERATIONS = 200;
const BISECTION_TOLERANCE = 1e-9;
const LOWER_RATE_BOUND = -0.9999; // rate can't reach -100% (division by zero)
const UPPER_RATE_BOUND = 100; // 10,000% annualized, a generous ceiling

function npv(rate: number, cashFlows: CashFlow[]): number {
  return cashFlows.reduce((sum, cf) => sum + cf.amount / Math.pow(1 + rate, cf.t), 0);
}

function npvDerivative(rate: number, cashFlows: CashFlow[]): number {
  return cashFlows.reduce(
    (sum, cf) => sum + (-cf.t * cf.amount) / Math.pow(1 + rate, cf.t + 1),
    0,
  );
}

/**
 * Solves for the annualized rate r such that the net present value of all
 * dated cash flows equals zero (money-weighted / XIRR-style return).
 *
 * Cash flow sign convention: positive = money in (contribution/starting balance),
 * negative = money out (terminal/ending value, treated as a final outflow for
 * solving purposes per the requirements doc's methodology).
 *
 * Returns null if there's no sign change in the cash flows (no valid IRR exists)
 * or if the solver fails to converge.
 */
export function xirr(cashFlows: CashFlow[], guess = 0.1): number | null {
  if (cashFlows.length < 2) return null;

  const hasPositive = cashFlows.some((cf) => cf.amount > 0);
  const hasNegative = cashFlows.some((cf) => cf.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  // Try Newton's method first — fast, but can diverge for pathological cash flow shapes.
  let rate = guess;
  for (let i = 0; i < MAX_NEWTON_ITERATIONS; i++) {
    const value = npv(rate, cashFlows);
    const derivative = npvDerivative(rate, cashFlows);

    if (Math.abs(derivative) < 1e-12) break; // avoid divide-by-near-zero, fall through to bisection

    const nextRate = rate - value / derivative;

    if (!Number.isFinite(nextRate) || nextRate <= LOWER_RATE_BOUND) break;

    if (Math.abs(nextRate - rate) < NEWTON_TOLERANCE) {
      return nextRate;
    }
    rate = nextRate;
  }

  // Fall back to bisection, which is slower but guaranteed to converge given a sign change in [lo, hi].
  return bisectionXirr(cashFlows);
}

function bisectionXirr(cashFlows: CashFlow[]): number | null {
  let lo = LOWER_RATE_BOUND;
  let hi = UPPER_RATE_BOUND;
  let npvLo = npv(lo, cashFlows);
  let npvHi = npv(hi, cashFlows);

  if (!Number.isFinite(npvLo) || !Number.isFinite(npvHi)) return null;
  if (npvLo === 0) return lo;
  if (npvHi === 0) return hi;
  if (Math.sign(npvLo) === Math.sign(npvHi)) return null; // no sign change, can't bisect

  for (let i = 0; i < MAX_BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const npvMid = npv(mid, cashFlows);

    if (Math.abs(npvMid) < BISECTION_TOLERANCE || (hi - lo) / 2 < BISECTION_TOLERANCE) {
      return mid;
    }

    if (Math.sign(npvMid) === Math.sign(npvLo)) {
      lo = mid;
      npvLo = npvMid;
    } else {
      hi = mid;
      npvHi = npvMid;
    }
  }

  return (lo + hi) / 2;
}
