import { z } from 'zod';
import { isValidIsoDate } from './dates.js';
import { validateRatePercent } from './rate.js';

/** Limits enforced on both sides. */
export const LIMITS = {
  minPrincipal: 100n, // ₦1
  maxPrincipal: 5_000_000_000_000n, // ₦50,000,000,000
  minTermMonths: 1,
  maxTermMonths: 360,
  maxFaceValue: 5_000_000_000_000n,
  maxTenorDays: 3650,
} as const;

// ---------- request field types ----------

/** Kobo on the wire: a non-negative integer string. JSON numbers are rejected on purpose. */
export const koboField = z
  .string({ invalid_type_error: 'Amount must be sent as a string of kobo' })
  .regex(/^\d+$/, 'Amount must be a whole number of kobo');

const KOBO_DIGITS = /^\d+$/;
/** zod runs refinements even after the regex fails, so each range check re-guards the format. */
const positiveKobo = (label: string, lo: bigint, hi: bigint) =>
  koboField
    .refine((s) => !KOBO_DIGITS.test(s) || BigInt(s) >= lo, `${label} must be at least ${lo} kobo`)
    .refine((s) => !KOBO_DIGITS.test(s) || BigInt(s) <= hi, `${label} is too large`);

export const isoDateField = z.string().refine(isValidIsoDate, 'Enter a valid date (YYYY-MM-DD)');

export const ratePctField = z.string({ invalid_type_error: 'Rate must be sent as a string' }).superRefine((s, ctx) => {
  const err = validateRatePercent(s);
  if (err) ctx.addIssue({ code: z.ZodIssueCode.custom, message: err });
});

// ---------- requests ----------

export const loanQuoteRequest = z.object({
  principal: positiveKobo('Principal', LIMITS.minPrincipal, LIMITS.maxPrincipal),
  annualRatePct: ratePctField,
  termMonths: z
    .number({ invalid_type_error: 'Term must be a number of months' })
    .int('Term must be a whole number of months')
    .min(LIMITS.minTermMonths, 'Term must be at least 1 month')
    .max(LIMITS.maxTermMonths, `Term cannot exceed ${LIMITS.maxTermMonths} months`),
  startDate: isoDateField,
  borrowerName: z.string().trim().min(1, 'Borrower name is required').max(120).optional(),
});
export type LoanQuoteRequest = z.infer<typeof loanQuoteRequest>;

export const createLoanRequest = loanQuoteRequest.extend({
  borrowerName: z.string().trim().min(1, 'Borrower name is required').max(120),
});
export type CreateLoanRequest = z.infer<typeof createLoanRequest>;

export const paymentRequest = z.object({
  amount: positiveKobo('Payment', 1n, LIMITS.maxPrincipal * 10n),
  paymentDate: isoDateField,
});
export type PaymentRequest = z.infer<typeof paymentRequest>;

export const payoffRequest = z.object({ paymentDate: isoDateField });
export type PayoffRequest = z.infer<typeof payoffRequest>;

export const invoiceQuoteRequest = z
  .object({
    faceValue: positiveKobo('Face value', 1n, LIMITS.maxFaceValue),
    fundingDate: isoDateField,
    dueDate: isoDateField,
    clientName: z.string().trim().min(1, 'Client name is required').max(120).optional(),
    debtorName: z.string().trim().max(120).optional(),
  })
  .superRefine((v, ctx) => {
    if (isValidIsoDate(v.fundingDate) && isValidIsoDate(v.dueDate) && v.dueDate <= v.fundingDate)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: 'Due date must be after the funding date' });
  });
export type InvoiceQuoteRequest = z.infer<typeof invoiceQuoteRequest>;

export const createInvoiceRequest = z
  .object({
    faceValue: positiveKobo('Face value', 1n, LIMITS.maxFaceValue),
    fundingDate: isoDateField,
    dueDate: isoDateField,
    clientName: z.string().trim().min(1, 'Client name is required').max(120),
    debtorName: z.string().trim().max(120).optional(),
  })
  .superRefine((v, ctx) => {
    if (isValidIsoDate(v.fundingDate) && isValidIsoDate(v.dueDate) && v.dueDate <= v.fundingDate)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: 'Due date must be after the funding date' });
  });
export type CreateInvoiceRequest = z.infer<typeof createInvoiceRequest>;

export const settlementRequest = z.object({ settlementDate: isoDateField });
export type SettlementRequest = z.infer<typeof settlementRequest>;

// ---------- errors ----------

export interface FieldError {
  field: string;
  message: string;
}
export interface ErrorBody {
  error: string;
  errors?: FieldError[];
}

export function zodToFieldErrors(err: z.ZodError): FieldError[] {
  return err.issues.map((i) => ({ field: i.path.join('.') || '_', message: i.message }));
}

// ---------- responses (decode wire strings → bigint) ----------

export const koboWire = z.string().regex(/^-?\d+$/).transform((s) => BigInt(s));

export const scheduleRowWire = z.object({
  number: z.number(),
  dueDate: z.string(),
  openingBalance: koboWire,
  payment: koboWire,
  interest: koboWire,
  principal: koboWire,
  closingBalance: koboWire,
});
export const scheduleWire = z.object({
  instalment: koboWire,
  rows: z.array(scheduleRowWire),
  totalInterest: koboWire,
  totalPayment: koboWire,
});

export const bucketsWire = z.object({ penalty: koboWire, fee: koboWire, interest: koboWire, principal: koboWire });

export const journalLineWire = z.object({
  account: z.string(),
  debit: koboWire,
  credit: koboWire,
});
export const journalEntryWire = z.object({
  id: z.number(),
  eventType: z.string(),
  effectiveDate: z.string(),
  memo: z.string(),
  reversesId: z.number().nullable(),
  lines: z.array(journalLineWire),
});
export type JournalEntryView = z.infer<typeof journalEntryWire>;

export const instalmentViewWire = z.object({
  number: z.number(),
  dueDate: z.string(),
  due: bucketsWire,
  paid: bucketsWire,
  waived: bucketsWire,
  outstanding: koboWire,
  status: z.enum(['PAID', 'PARTIAL', 'DUE', 'OVERDUE', 'UPCOMING', 'WAIVED']),
});
export type InstalmentView = z.infer<typeof instalmentViewWire>;

export const loanViewWire = z.object({
  id: z.number(),
  borrowerName: z.string(),
  principal: koboWire,
  annualRatePct: z.string(),
  termMonths: z.number(),
  startDate: z.string(),
  status: z.enum(['ACTIVE', 'CLOSED']),
  instalmentAmount: koboWire,
  outstandingPrincipal: koboWire,
  unappliedCredit: koboWire,
  instalments: z.array(instalmentViewWire),
  schedule: scheduleWire,
});
export type LoanView = z.infer<typeof loanViewWire>;

export const allocationWire = z.object({
  amount: koboWire,
  lines: z.array(bucketsWire.extend({ number: z.number(), dueDate: z.string() })),
  totals: bucketsWire,
  unappliedCredit: koboWire,
});
export type AllocationView = z.infer<typeof allocationWire>;

export const payoffWire = z.object({
  asOfDate: z.string(),
  lines: z.array(bucketsWire.extend({ number: z.number(), dueDate: z.string() })),
  totals: bucketsWire,
  waived: z.array(bucketsWire.extend({ number: z.number() })),
  interestWaived: koboWire,
  total: koboWire,
});
export type PayoffView = z.infer<typeof payoffWire>;

export const statementLineWire = z.object({
  entryId: z.number(),
  date: z.string(),
  eventType: z.string(),
  memo: z.string(),
  /** Cash in (+) or out (−) for this entry. */
  cash: koboWire,
  interest: koboWire,
  penalty: koboWire,
  fee: koboWire,
  unapplied: koboWire,
  /** Loans Receivable movement for this entry. */
  debit: koboWire,
  credit: koboWire,
  runningBalance: koboWire,
});
export const statementWire = z.object({
  loanId: z.number(),
  borrowerName: z.string(),
  lines: z.array(statementLineWire),
  closingBalance: koboWire,
  scheduleOutstandingPrincipal: koboWire,
  difference: koboWire,
  tiesOut: z.boolean(),
  totals: z.object({ interestCollected: koboWire, penaltyCollected: koboWire, feeCollected: koboWire, unappliedCredit: koboWire }),
});
export type StatementView = z.infer<typeof statementWire>;

export const invoiceQuoteWire = z.object({
  faceValue: koboWire,
  fundingDate: z.string(),
  dueDate: z.string(),
  tenorDays: z.number(),
  advance: koboWire,
  reserve: koboWire,
  discountFee: koboWire,
});
export const invoiceSettlementWire = z.object({
  settlementDate: z.string(),
  daysOverdue: z.number(),
  cashReceived: koboWire,
  advance: koboWire,
  reserve: koboWire,
  discountFee: koboWire,
  penalty: koboWire,
  totalCharges: koboWire,
  clientReceives: koboWire,
  clientOwes: koboWire,
});
export const invoiceViewWire = invoiceQuoteWire.extend({
  id: z.number(),
  clientName: z.string(),
  debtorName: z.string(),
  status: z.enum(['ADVANCED', 'SETTLED']),
  settlement: invoiceSettlementWire.nullable(),
  journal: z.array(journalEntryWire),
});
export type InvoiceView = z.infer<typeof invoiceViewWire>;

export const paymentViewWire = z.object({
  id: z.number(),
  loanId: z.number(),
  borrowerName: z.string(),
  kind: z.enum(['PAYMENT', 'PAYOFF']),
  amount: koboWire,
  paymentDate: z.string(),
  unappliedCredit: koboWire,
  journalEntryId: z.number(),
  applied: bucketsWire,
});
export type PaymentView = z.infer<typeof paymentViewWire>;

export const loanSummaryWire = z.object({
  id: z.number(),
  borrowerName: z.string(),
  principal: koboWire,
  annualRatePct: z.string(),
  termMonths: z.number(),
  startDate: z.string(),
  status: z.enum(['ACTIVE', 'CLOSED']),
  outstandingPrincipal: koboWire,
});
export type LoanSummary = z.infer<typeof loanSummaryWire>;
