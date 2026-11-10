import {
  allocate,
  compareDates,
  payoffQuote,
  paymentLines,
  type Allocation,
  type JournalLine,
  type Kobo,
  type PayoffQuote,
} from '../money/index.js';
import type { Tx } from '../db/transaction.js';
import { badRequest, conflict } from '../domain/errors.js';
import type { InstalmentBuckets, PaymentKind, PaymentRepository } from '../repositories/payment.repository.js';
import type { JournalEntry, LedgerService } from './ledger.service.js';
import type { LoanService } from './loan.service.js';

interface Deps {
  loans: LoanService;
  paymentRepo: PaymentRepository;
  ledger: LedgerService;
  tx: Tx;
}

export interface PaymentPreview {
  allocation: Allocation;
  journalLines: JournalLine[];
}
export interface PayoffPreview {
  quote: PayoffQuote;
  journalLines: JournalLine[];
}

const describeAllocation = (lines: Allocation['lines']) =>
  lines.length === 0
    ? 'Repayment held as unapplied credit (nothing due yet)'
    : `Repayment applied to instalment${lines.length > 1 ? 's' : ''} ${lines.map((l) => `#${l.number}`).join(', ')}`;

/**
 * Repayments and early payoff. Previews and posts call the same functions, so
 * what the officer confirmed is exactly what gets posted.
 */
export function createRepaymentService({ loans, paymentRepo, ledger, tx }: Deps) {
  function assertPayable(loanId: number, paymentDate: string) {
    const loan = loans.get(loanId);
    if (loan.status !== 'ACTIVE') throw conflict('This loan is closed and cannot take payments');
    if (compareDates(paymentDate, loan.startDate) < 0) throw badRequest('Payment date cannot be before the disbursement date', 'paymentDate');
  }

  function previewPayment(loanId: number, amount: Kobo, paymentDate: string): PaymentPreview {
    assertPayable(loanId, paymentDate);
    const allocation = allocate(loans.instalmentState(loanId), amount, paymentDate);
    return { allocation, journalLines: paymentLines(amount, allocation.totals, allocation.unappliedCredit) };
  }

  function previewPayoff(loanId: number, paymentDate: string): PayoffPreview {
    assertPayable(loanId, paymentDate);
    const quote = payoffQuote(loans.instalmentState(loanId), paymentDate);
    if (quote.total === 0n) throw conflict('Nothing is owed on this loan');
    return { quote, journalLines: paymentLines(quote.total, quote.totals, 0n) };
  }

  /** Shared posting path: journal entry → payment record → allocations (→ waivers) → close check. */
  function record(p: {
    loanId: number;
    kind: PaymentKind;
    amount: Kobo;
    paymentDate: string;
    unappliedCredit: Kobo;
    allocations: readonly InstalmentBuckets[];
    waivers?: readonly InstalmentBuckets[];
    journalLines: JournalLine[];
    memo: string;
  }): { paymentId: number; journalEntry: JournalEntry; closed: boolean } {
    const journalEntry = ledger.post({ eventType: p.kind, effectiveDate: p.paymentDate, memo: p.memo, loanId: p.loanId, lines: p.journalLines });
    const paymentId = paymentRepo.insert({
      loanId: p.loanId,
      kind: p.kind,
      amount: p.amount,
      paymentDate: p.paymentDate,
      unappliedCredit: p.unappliedCredit,
      journalEntryId: journalEntry.id,
    });
    paymentRepo.insertAllocations(paymentId, p.loanId, p.allocations);
    if (p.waivers) paymentRepo.insertWaivers(paymentId, p.loanId, p.waivers);
    return { paymentId, journalEntry, closed: loans.closeIfCleared(p.loanId) };
  }

  function postPayment(loanId: number, amount: Kobo, paymentDate: string) {
    return tx(() => {
      // Re-read state inside the transaction; never reuse a stale preview.
      const { allocation, journalLines } = previewPayment(loanId, amount, paymentDate);
      const { paymentId, journalEntry } = record({
        loanId,
        kind: 'PAYMENT',
        amount,
        paymentDate,
        unappliedCredit: allocation.unappliedCredit,
        allocations: allocation.lines,
        journalLines,
        memo: describeAllocation(allocation.lines),
      });
      return { paymentId, allocation, journalEntry };
    });
  }

  function postPayoff(loanId: number, paymentDate: string) {
    return tx(() => {
      const { quote, journalLines } = previewPayoff(loanId, paymentDate);
      const { paymentId, journalEntry, closed } = record({
        loanId,
        kind: 'PAYOFF',
        amount: quote.total,
        paymentDate,
        unappliedCredit: 0n,
        allocations: quote.lines,
        waivers: quote.waived,
        journalLines,
        memo: quote.interestWaived > 0n ? 'Early payoff (future interest waived)' : 'Loan payoff',
      });
      if (!closed) throw new Error('Payoff did not clear the loan');
      return { paymentId, quote, journalEntry };
    });
  }

  /** Posted payments, newest first: for one loan (404 if it doesn't exist) or across all loans. */
  function history(loanId?: number) {
    if (loanId !== undefined) loans.get(loanId);
    return paymentRepo.findHistory(loanId ?? null);
  }

  return { previewPayment, postPayment, previewPayoff, postPayoff, history };
}

export type RepaymentService = ReturnType<typeof createRepaymentService>;
