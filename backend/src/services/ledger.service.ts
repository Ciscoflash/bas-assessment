import { isBalanced, type AccountCode, type JournalLine } from '../money/index.js';
import type { Tx } from '../db/transaction.js';
import { conflict, notFound } from '../domain/errors.js';
import type { EntryRecord, LedgerRepository } from '../repositories/ledger.repository.js';

export interface PostEntryInput {
  eventType: string;
  effectiveDate: string;
  memo?: string;
  loanId?: number;
  invoiceId?: number;
  reversesId?: number;
  lines: readonly JournalLine[];
}

export interface JournalEntry {
  id: number;
  eventType: string;
  effectiveDate: string;
  memo: string;
  reversesId: number | null;
  lines: JournalLine[];
}

/**
 * Double-entry rules, independent of storage: zero lines are dropped, then an
 * entry needs at least two lines, no negative or two-sided lines, and Σdr = Σcr.
 * Throws a plain Error: a violation here is a programming bug, not user input.
 */
export function normaliseLines(lines: readonly JournalLine[]): JournalLine[] {
  const kept = lines.filter((l) => l.debit !== 0n || l.credit !== 0n);
  for (const l of kept) {
    if (l.debit < 0n || l.credit < 0n) throw new Error(`Negative amount on ${l.account}`);
    if (l.debit !== 0n && l.credit !== 0n) throw new Error(`Line on ${l.account} has both a debit and a credit`);
  }
  if (kept.length < 2) throw new Error('A journal entry needs at least two non-zero lines');
  if (!isBalanced(kept)) throw new Error('Journal entry does not balance');
  return kept;
}

export function createLedgerService({ ledgerRepo, tx }: { ledgerRepo: LedgerRepository; tx: Tx }) {
  /** Attach lines to entry records in one query. */
  function hydrate(entries: EntryRecord[]): JournalEntry[] {
    const lines = ledgerRepo.findLines(entries.map((e) => e.id));
    return entries.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      effectiveDate: e.effectiveDate,
      memo: e.memo,
      reversesId: e.reversesId,
      lines: lines.filter((l) => l.entryId === e.id).map(({ account, debit, credit }) => ({ account, debit, credit })),
    }));
  }

  function getEntry(id: number): JournalEntry {
    const entry = ledgerRepo.findById(id);
    if (!entry) throw notFound('Journal entry');
    return hydrate([entry])[0]!;
  }

  function post(input: PostEntryInput): JournalEntry {
    const lines = normaliseLines(input.lines);
    const record = {
      eventType: input.eventType,
      effectiveDate: input.effectiveDate,
      memo: input.memo ?? '',
      loanId: input.loanId ?? null,
      invoiceId: input.invoiceId ?? null,
      reversesId: input.reversesId ?? null,
    };
    const id = tx(() => ledgerRepo.insertEntry(record, lines));
    return { id, eventType: record.eventType, effectiveDate: record.effectiveDate, memo: record.memo, reversesId: record.reversesId, lines };
  }

  /** Correct a mistake by posting the mirror image. The original is never touched. */
  function reverse(entryId: number, effectiveDate: string, memo = ''): JournalEntry {
    return tx(() => {
      const original = ledgerRepo.findById(entryId);
      if (!original) throw notFound('Journal entry');
      if (ledgerRepo.isReversed(entryId)) throw conflict('Entry has already been reversed');
      return post({
        eventType: 'REVERSAL',
        effectiveDate,
        memo: memo || `Reversal of entry #${entryId}`,
        loanId: original.loanId ?? undefined,
        invoiceId: original.invoiceId ?? undefined,
        reversesId: entryId,
        lines: getEntry(entryId).lines.map((l) => ({ account: l.account, debit: l.credit, credit: l.debit })),
      });
    });
  }

  function trialBalance() {
    const accounts = ledgerRepo.accountTotals();
    const totalDebit = accounts.reduce((a, r) => a + r.debit, 0n);
    const totalCredit = accounts.reduce((a, r) => a + r.credit, 0n);
    return { accounts, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
  }

  return {
    post,
    reverse,
    getEntry,
    trialBalance,
    entriesForLoan: (loanId: number) => hydrate(ledgerRepo.findByLoan(loanId)),
    entriesForInvoice: (invoiceId: number) => hydrate(ledgerRepo.findByInvoice(invoiceId)),
    recentEntries: (limit = 200) => hydrate(ledgerRepo.findRecent(limit)),
    /** Debit-normal balance (debits − credits) of one account across a loan's entries. */
    loanAccountBalance: (loanId: number, account: AccountCode) => ledgerRepo.netForLoan(loanId, account),
  };
}

export type LedgerService = ReturnType<typeof createLedgerService>;
