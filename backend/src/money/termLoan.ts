import { addMonths, type IsoDate } from './dates.js';
import type { Kobo } from './money.js';
import { parseRatePercent } from './rate.js';
import { ONE, add, div, isZero, mul, pow, rat, roundHalfUp, sub, type Rational } from './rational.js';

export interface TermLoanInput {
  principal: Kobo;
  /** Annual nominal rate as a percent string, e.g. "18". */
  annualRatePct: string;
  termMonths: number;
  /** Disbursement date; instalment k falls due k months later. */
  startDate: IsoDate;
}

export interface ScheduleRow {
  number: number;
  dueDate: IsoDate;
  openingBalance: Kobo;
  payment: Kobo;
  interest: Kobo;
  principal: Kobo;
  closingBalance: Kobo;
}

export interface Schedule {
  instalment: Kobo;
  rows: ScheduleRow[];
  totalInterest: Kobo;
  totalPayment: Kobo;
}

export const monthlyRate = (annualRatePct: string): Rational => div(parseRatePercent(annualRatePct), rat(12n));

/** Instalment = P·i / (1 − (1+i)^−n), rounded half-up once. Exact until that rounding. */
export function annuityInstalment(principal: Kobo, i: Rational, n: number): Kobo {
  if (n < 1) throw new RangeError('Term must be at least 1 month');
  if (isZero(i)) return roundHalfUp(rat(principal, BigInt(n)));
  const growth = pow(add(ONE, i), n); // (1+i)^n
  // P·i/(1 − (1+i)^−n) == P·i·(1+i)^n / ((1+i)^n − 1)
  return roundHalfUp(div(mul(mul(rat(principal), i), growth), sub(growth, ONE)));
}

export function buildSchedule(input: TermLoanInput): Schedule {
  const { principal, annualRatePct, termMonths: n, startDate } = input;
  if (principal <= 0n) throw new RangeError('Principal must be positive');
  if (!Number.isInteger(n) || n < 1) throw new RangeError('Term must be a whole number of months ≥ 1');
  const i = monthlyRate(annualRatePct);
  const instalment = annuityInstalment(principal, i, n);

  const rows: ScheduleRow[] = [];
  let balance = principal;
  for (let k = 1; k <= n; k++) {
    const interest = roundHalfUp(mul(rat(balance), i));
    const isLast = k === n;
    // The final instalment clears whatever balance remains.
    const principalPart = isLast ? balance : instalment - interest;
    const payment = isLast ? principalPart + interest : instalment;
    const closing = balance - principalPart;
    rows.push({
      number: k,
      dueDate: addMonths(startDate, k),
      openingBalance: balance,
      payment,
      interest,
      principal: principalPart,
      closingBalance: closing,
    });
    balance = closing;
  }

  return {
    instalment,
    rows,
    totalInterest: rows.reduce((a, r) => a + r.interest, 0n),
    totalPayment: rows.reduce((a, r) => a + r.payment, 0n),
  };
}
