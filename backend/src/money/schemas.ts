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
