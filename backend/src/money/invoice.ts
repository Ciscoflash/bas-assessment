import { daysBetween, type IsoDate } from './dates.js';
import type { Kobo } from './money.js';
import { mul, rat, roundHalfUp } from './rational.js';

/** Product A constants from the brief. */
export const ADVANCE_RATE = rat(80n, 100n);
export const DISCOUNT_ANNUAL_RATE = rat(36n, 100n);
export const PENALTY_DAILY_RATE = rat(2n, 1000n); // 0.2% per day
export const DAY_COUNT_BASIS = 365n;

export interface InvoiceQuoteInput {
  faceValue: Kobo;
  fundingDate: IsoDate;
  dueDate: IsoDate;
}

export interface InvoiceQuote {
  faceValue: Kobo;
  fundingDate: IsoDate;
  dueDate: IsoDate;
  tenorDays: number;
  advance: Kobo;
  reserve: Kobo;
  discountFee: Kobo;
}

export interface InvoiceSettlement {
  settlementDate: IsoDate;
  daysOverdue: number;
  /** Cash received from the debtor (the full face value). */
  cashReceived: Kobo;
  advance: Kobo;
  reserve: Kobo;
  discountFee: Kobo;
  penalty: Kobo;
  totalCharges: Kobo;
  /** Never negative. */
  clientReceives: Kobo;
  /** Never negative; > 0 only in the shortfall case. */
  clientOwes: Kobo;
}

/** Advance = face × 80%, rounded half-up (the brief names no rounding point; see NOTES.md). */
export const invoiceAdvance = (faceValue: Kobo): Kobo => roundHalfUp(mul(rat(faceValue), ADVANCE_RATE));

/** Discount fee = advance × 36% × tenor days / 365, rounded half-up once. */
export const discountFee = (advance: Kobo, tenorDays: number): Kobo =>
  roundHalfUp(mul(mul(rat(advance), DISCOUNT_ANNUAL_RATE), rat(BigInt(tenorDays), DAY_COUNT_BASIS)));

/** Late penalty = advance × 0.2% × days overdue, rounded half-up once over the whole period. */
export const latePenalty = (advance: Kobo, daysOverdue: number): Kobo =>
  daysOverdue <= 0 ? 0n : roundHalfUp(mul(mul(rat(advance), PENALTY_DAILY_RATE), rat(BigInt(daysOverdue))));

export function quoteInvoice({ faceValue, fundingDate, dueDate }: InvoiceQuoteInput): InvoiceQuote {
  if (faceValue <= 0n) throw new RangeError('Face value must be positive');
  const tenorDays = daysBetween(fundingDate, dueDate);
  if (tenorDays < 1) throw new RangeError('Due date must be after the funding date');
  const advance = invoiceAdvance(faceValue);
  return {
    faceValue,
    fundingDate,
    dueDate,
    tenorDays,
    advance,
    reserve: faceValue - advance,
    discountFee: discountFee(advance, tenorDays),
  };
}

/** Overdue days start the day after the due date: settling on the due date is 0 days overdue. */
export const daysOverdue = (dueDate: IsoDate, settlementDate: IsoDate) =>
  Math.max(0, daysBetween(dueDate, settlementDate));

export function settleInvoice(quote: InvoiceQuote, settlementDate: IsoDate): InvoiceSettlement {
  if (daysBetween(quote.fundingDate, settlementDate) < 0) throw new RangeError('Settlement cannot be before funding');
  const overdue = daysOverdue(quote.dueDate, settlementDate);
  const penalty = latePenalty(quote.advance, overdue);
  const totalCharges = quote.discountFee + penalty;
  const surplus = quote.reserve - totalCharges;
  return {
    settlementDate,
    daysOverdue: overdue,
    cashReceived: quote.faceValue,
    advance: quote.advance,
    reserve: quote.reserve,
    discountFee: quote.discountFee,
    penalty,
    totalCharges,
    clientReceives: surplus > 0n ? surplus : 0n,
    clientOwes: surplus < 0n ? -surplus : 0n,
  };
}
