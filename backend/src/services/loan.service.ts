import {
  COMPONENTS,
  buildSchedule,
  compareDates,
  disbursementLines,
  emptyBuckets,
  outstandingPrincipal,
  outstandingTotal,
  type CreateLoanRequest,
  type InstalmentState,
  type Schedule,
  type TermLoanInput,
} from '../money/index.js';
import type { Tx } from '../db/transaction.js';
import { notFound } from '../domain/errors.js';
import type { InstalmentRecord, LoanRecord, LoanRepository } from '../repositories/loan.repository.js';
import type { PaymentRepository } from '../repositories/payment.repository.js';
import type { LedgerService } from './ledger.service.js';

export type InstalmentStatus = 'PAID' | 'WAIVED' | 'PARTIAL' | 'OVERDUE' | 'DUE' | 'UPCOMING';

/** Display status of one instalment as of a date. */
export function instalmentStatus(s: InstalmentState, asOf: string): InstalmentStatus {
  if (outstandingTotal(s) === 0n) return s.waived.interest > 0n ? 'WAIVED' : 'PAID';
  if (COMPONENTS.some((c) => s.paid[c] > 0n)) return 'PARTIAL';
  const cmp = compareDates(s.dueDate, asOf);
  return cmp < 0 ? 'OVERDUE' : cmp === 0 ? 'DUE' : 'UPCOMING';
}

interface Deps {
  loanRepo: LoanRepository;
  paymentRepo: PaymentRepository;
  ledger: LedgerService;
  tx: Tx;
}

export function createLoanService({ loanRepo, paymentRepo, ledger, tx }: Deps) {
  function get(id: number): LoanRecord {
    const loan = loanRepo.findById(id);
    if (!loan) throw notFound('Loan');
    return loan;
  }

  /** Fixed schedule + allocation history → current state of each instalment. */
  function toState(loanId: number, instalments: InstalmentRecord[]): InstalmentState[] {
    const paid = paymentRepo.allocatedByInstalment(loanId);
    const waived = paymentRepo.waivedByInstalment(loanId);
    return instalments.map((i) => ({
      number: i.number,
      dueDate: i.dueDate,
      due: i.due,
      paid: paid.get(i.number) ?? emptyBuckets(),
      waived: waived.get(i.number) ?? emptyBuckets(),
    }));
  }

  const instalmentState = (loanId: number) => toState(loanId, loanRepo.findInstalments(loanId));

  function quote(input: TermLoanInput): Schedule {
    return buildSchedule(input);
  }

  /** Approve and disburse: recompute the schedule here (never trust the client's), persist it, post the disbursement. */
  function originate(req: CreateLoanRequest) {
    const principal = BigInt(req.principal);
    const schedule = quote({ principal, annualRatePct: req.annualRatePct, termMonths: req.termMonths, startDate: req.startDate });
    return tx(() => {
      const loanId = loanRepo.insert(
        {
          borrowerName: req.borrowerName,
          principal,
          annualRatePct: req.annualRatePct,
          termMonths: req.termMonths,
          startDate: req.startDate,
          instalment: schedule.instalment,
        },
        schedule.rows,
      );
      const journalEntry = ledger.post({
        eventType: 'DISBURSEMENT',
        effectiveDate: req.startDate,
        memo: `Disbursement to ${req.borrowerName}`,
        loanId,
        lines: disbursementLines(principal),
      });
      return { loanId, journalEntry };
    });
  }

  /** Close the loan once nothing is owed on any instalment. */
  function closeIfCleared(loanId: number): boolean {
    const cleared = instalmentState(loanId).every((s) => outstandingTotal(s) === 0n);
    if (cleared) loanRepo.setStatus(loanId, 'CLOSED');
    return cleared;
  }

  /** Full read model for the loan screen. */
  function view(id: number, asOf: string) {
    const { instalment, ...loan } = get(id);
    const instalments = loanRepo.findInstalments(id);
    const state = toState(id, instalments);
    return {
      ...loan,
      instalmentAmount: instalment,
      outstandingPrincipal: outstandingPrincipal(state),
      unappliedCredit: -ledger.loanAccountBalance(id, 'UNAPPLIED_CREDIT'), // liability: credit-normal
      instalments: state.map((s) => ({ ...s, outstanding: outstandingTotal(s), status: instalmentStatus(s, asOf) })),
      schedule: {
        instalment,
        rows: instalments.map((i) => ({
          number: i.number,
          dueDate: i.dueDate,
          openingBalance: i.openingBalance,
          payment: i.payment,
          interest: i.due.interest,
          principal: i.due.principal,
          closingBalance: i.closingBalance,
        })),
        totalInterest: instalments.reduce((a, i) => a + i.due.interest, 0n),
        totalPayment: instalments.reduce((a, i) => a + i.payment, 0n),
      },
    };
  }

  function list() {
    return loanRepo.findAll().map(({ instalment: _instalment, ...loan }) => ({
      ...loan,
      outstandingPrincipal: outstandingPrincipal(instalmentState(loan.id)),
    }));
  }

  return { get, quote, originate, instalmentState, closeIfCleared, view, list };
}

export type LoanService = ReturnType<typeof createLoanService>;
