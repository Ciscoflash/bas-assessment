import type { Buckets } from './allocation.js';
import type { InvoiceSettlement } from './invoice.js';
import type { Kobo } from './money.js';

export const ACCOUNTS = {
  CASH: { name: 'Cash', type: 'ASSET' },
  LOANS_RECEIVABLE: { name: 'Loans Receivable', type: 'ASSET' },
  INVOICE_RECEIVABLES: { name: 'Invoice Receivables', type: 'ASSET' },
  CLIENT_RECEIVABLE: { name: 'Client Receivable', type: 'ASSET' },
  INTEREST_INCOME: { name: 'Interest Income', type: 'INCOME' },
  FEE_INCOME: { name: 'Fee Income', type: 'INCOME' },
  PENALTY_INCOME: { name: 'Penalty Income', type: 'INCOME' },
  CLIENT_PAYABLE: { name: 'Client Payable', type: 'LIABILITY' },
  UNAPPLIED_CREDIT: { name: 'Unapplied Credit', type: 'LIABILITY' },
} as const;
export type AccountCode = keyof typeof ACCOUNTS;

export interface JournalLine {
  account: AccountCode;
  debit: Kobo;
  credit: Kobo;
}

const dr = (account: AccountCode, amount: Kobo): JournalLine => ({ account, debit: amount, credit: 0n });
const cr = (account: AccountCode, amount: Kobo): JournalLine => ({ account, debit: 0n, credit: amount });

/** Zero-amount lines are not posted. */
const nonZero = (lines: JournalLine[]) => lines.filter((l) => l.debit !== 0n || l.credit !== 0n);

export const disbursementLines = (principal: Kobo): JournalLine[] =>
  nonZero([dr('LOANS_RECEIVABLE', principal), cr('CASH', principal)]);

/** Payment and early payoff: Dr Cash total; Cr each part of the allocation. */
export const paymentLines = (amount: Kobo, totals: Buckets, unappliedCredit: Kobo): JournalLine[] =>
  nonZero([
    dr('CASH', amount),
    cr('LOANS_RECEIVABLE', totals.principal),
    cr('INTEREST_INCOME', totals.interest),
    cr('PENALTY_INCOME', totals.penalty),
    cr('FEE_INCOME', totals.fee),
    cr('UNAPPLIED_CREDIT', unappliedCredit),
  ]);

export const invoiceAdvanceLines = (advance: Kobo): JournalLine[] =>
  nonZero([dr('INVOICE_RECEIVABLES', advance), cr('CASH', advance)]);

export const invoiceSettlementLines = (s: InvoiceSettlement): JournalLine[] =>
  nonZero([
    dr('CASH', s.cashReceived),
    dr('CLIENT_RECEIVABLE', s.clientOwes),
    cr('INVOICE_RECEIVABLES', s.advance),
    cr('FEE_INCOME', s.discountFee),
    cr('PENALTY_INCOME', s.penalty),
    cr('CLIENT_PAYABLE', s.clientReceives),
  ]);

export function isBalanced(lines: readonly JournalLine[]): boolean {
  let d = 0n;
  let c = 0n;
  for (const l of lines) {
    d += l.debit;
    c += l.credit;
  }
  return d === c;
}
