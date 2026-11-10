import { outstandingPrincipal, type AccountCode } from '../money/index.js';
import type { JournalEntry, LedgerService } from './ledger.service.js';
import type { LoanService } from './loan.service.js';

/** Debit and credit totals per account within one entry. */
function movements(entry: JournalEntry) {
  const sums = new Map<AccountCode, { debit: bigint; credit: bigint }>();
  for (const l of entry.lines) {
    const s = sums.get(l.account) ?? { debit: 0n, credit: 0n };
    s.debit += l.debit;
    s.credit += l.credit;
    sums.set(l.account, s);
  }
  const of = (a: AccountCode) => sums.get(a) ?? { debit: 0n, credit: 0n };
  return {
    debit: (a: AccountCode) => of(a).debit,
    credit: (a: AccountCode) => of(a).credit,
    /** Credit-normal net (income, liabilities). */
    netCredit: (a: AccountCode) => of(a).credit - of(a).debit,
    /** Debit-normal net (assets). */
    netDebit: (a: AccountCode) => of(a).debit - of(a).credit,
  };
}

const sumBy = <T>(rows: readonly T[], pick: (r: T) => bigint) => rows.reduce((a, r) => a + pick(r), 0n);

/**
 * Borrower statement built from the loan's ledger lines. The running balance is
 * Loans Receivable debits − credits. Tie-out compares it with the outstanding
 * principal from the schedule/allocation subledger: two independent sources.
 */
export function createStatementService({ loans, ledger }: { loans: LoanService; ledger: LedgerService }) {
  function statement(loanId: number) {
    const loan = loans.get(loanId);
    let running = 0n;
    const lines = ledger.entriesForLoan(loanId).map((e) => {
      const m = movements(e);
      running += m.netDebit('LOANS_RECEIVABLE');
      return {
        entryId: e.id,
        date: e.effectiveDate,
        eventType: e.eventType,
        memo: e.memo,
        cash: m.netDebit('CASH'),
        interest: m.netCredit('INTEREST_INCOME'),
        penalty: m.netCredit('PENALTY_INCOME'),
        fee: m.netCredit('FEE_INCOME'),
        unapplied: m.netCredit('UNAPPLIED_CREDIT'),
        debit: m.debit('LOANS_RECEIVABLE'),
        credit: m.credit('LOANS_RECEIVABLE'),
        runningBalance: running,
      };
    });

    const scheduleOutstandingPrincipal = outstandingPrincipal(loans.instalmentState(loanId));
    const difference = running - scheduleOutstandingPrincipal;
    return {
      loanId,
      borrowerName: loan.borrowerName,
      lines,
      closingBalance: running,
      scheduleOutstandingPrincipal,
      difference,
      tiesOut: difference === 0n,
      totals: {
        interestCollected: sumBy(lines, (l) => l.interest),
        penaltyCollected: sumBy(lines, (l) => l.penalty),
        feeCollected: sumBy(lines, (l) => l.fee),
        unappliedCredit: sumBy(lines, (l) => l.unapplied),
      },
    };
  }

  return { statement };
}

export type StatementService = ReturnType<typeof createStatementService>;
