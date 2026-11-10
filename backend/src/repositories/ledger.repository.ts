import type { AccountCode, JournalLine } from '../money/index.js';
import type { DB } from '../db/connection.js';
import { toNum, toNumOrNull } from '../db/mappers.js';

export interface EntryRecord {
  id: number;
  eventType: string;
  effectiveDate: string;
  memo: string;
  loanId: number | null;
  invoiceId: number | null;
  reversesId: number | null;
}
export type NewEntry = Omit<EntryRecord, 'id'>;
export type LineRecord = JournalLine & { entryId: number };

export interface AccountTotalRecord {
  account: AccountCode;
  name: string;
  type: string;
  debit: bigint;
  credit: bigint;
}

interface EntryRow {
  id: bigint;
  event_type: string;
  effective_date: string;
  memo: string;
  loan_id: bigint | null;
  invoice_id: bigint | null;
  reverses_id: bigint | null;
}

const ENTRY_COLUMNS = 'id, event_type, effective_date, memo, loan_id, invoice_id, reverses_id';

const toEntry = (r: EntryRow): EntryRecord => ({
  id: toNum(r.id),
  eventType: r.event_type,
  effectiveDate: r.effective_date,
  memo: r.memo,
  loanId: toNumOrNull(r.loan_id),
  invoiceId: toNumOrNull(r.invoice_id),
  reversesId: toNumOrNull(r.reverses_id),
});

/** Journal storage. Insert and read only: the schema forbids updates and deletes. */
export function createLedgerRepository(db: DB) {
  const stmt = {
    insertEntry: db.prepare(
      `INSERT INTO journal_entries (event_type, effective_date, memo, loan_id, invoice_id, reverses_id)
       VALUES (@eventType, @effectiveDate, @memo, @loanId, @invoiceId, @reversesId)`,
    ),
    insertLine: db.prepare('INSERT INTO journal_lines (entry_id, account, debit, credit) VALUES (?, ?, ?, ?)'),
    byId: db.prepare(`SELECT ${ENTRY_COLUMNS} FROM journal_entries WHERE id = ?`),
    byLoan: db.prepare(`SELECT ${ENTRY_COLUMNS} FROM journal_entries WHERE loan_id = ? ORDER BY effective_date, id`),
    byInvoice: db.prepare(`SELECT ${ENTRY_COLUMNS} FROM journal_entries WHERE invoice_id = ? ORDER BY effective_date, id`),
    recent: db.prepare(`SELECT ${ENTRY_COLUMNS} FROM journal_entries ORDER BY id DESC LIMIT ?`),
    reversalOf: db.prepare('SELECT id FROM journal_entries WHERE reverses_id = ?'),
    accountTotals: db.prepare(
      `SELECT a.code AS account, a.name, a.type, COALESCE(SUM(l.debit), 0) AS debit, COALESCE(SUM(l.credit), 0) AS credit
       FROM accounts a LEFT JOIN journal_lines l ON l.account = a.code
       GROUP BY a.code ORDER BY a.rowid`,
    ),
    netForLoan: db.prepare(
      `SELECT COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) AS net
       FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
       WHERE e.loan_id = ? AND l.account = ?`,
    ),
  };

  return {
    insertEntry(entry: NewEntry, lines: readonly JournalLine[]): number {
      const id = toNum(stmt.insertEntry.run(entry).lastInsertRowid as bigint);
      for (const l of lines) stmt.insertLine.run(id, l.account, l.debit, l.credit);
      return id;
    },

    findById(id: number): EntryRecord | undefined {
      const row = stmt.byId.get(id) as EntryRow | undefined;
      return row && toEntry(row);
    },

    findByLoan: (loanId: number) => (stmt.byLoan.all(loanId) as EntryRow[]).map(toEntry),
    findByInvoice: (invoiceId: number) => (stmt.byInvoice.all(invoiceId) as EntryRow[]).map(toEntry),
    findRecent: (limit: number) => (stmt.recent.all(limit) as EntryRow[]).map(toEntry),

    findLines(entryIds: readonly number[]): LineRecord[] {
      if (entryIds.length === 0) return [];
      const rows = db
        .prepare(
          `SELECT entry_id, account, debit, credit FROM journal_lines
           WHERE entry_id IN (${entryIds.map(() => '?').join(',')}) ORDER BY id`,
        )
        .all(...entryIds) as { entry_id: bigint; account: AccountCode; debit: bigint; credit: bigint }[];
      return rows.map((r) => ({ entryId: toNum(r.entry_id), account: r.account, debit: r.debit, credit: r.credit }));
    },

    isReversed: (entryId: number): boolean => stmt.reversalOf.get(entryId) !== undefined,

    accountTotals: () => stmt.accountTotals.all() as AccountTotalRecord[],

    /** Debits − credits on one account, for one loan's entries. */
    netForLoan: (loanId: number, account: AccountCode): bigint => (stmt.netForLoan.get(loanId, account) as { net: bigint }).net,
  };
}

export type LedgerRepository = ReturnType<typeof createLedgerRepository>;
