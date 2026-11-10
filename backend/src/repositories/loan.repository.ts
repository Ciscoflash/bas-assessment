import type { Buckets, Kobo, ScheduleRow } from '../money/index.js';
import type { DB } from '../db/connection.js';
import { toNum } from '../db/mappers.js';

export type LoanStatus = 'ACTIVE' | 'CLOSED';

export interface LoanRecord {
  id: number;
  borrowerName: string;
  principal: Kobo;
  annualRatePct: string;
  termMonths: number;
  startDate: string;
  instalment: Kobo;
  status: LoanStatus;
}
export type NewLoan = Omit<LoanRecord, 'id' | 'status'>;

/** One row of the schedule as originated. Never changes after disbursement. */
export interface InstalmentRecord {
  number: number;
  dueDate: string;
  openingBalance: Kobo;
  payment: Kobo;
  closingBalance: Kobo;
  due: Buckets;
}

interface LoanRow {
  id: bigint;
  borrower_name: string;
  principal: bigint;
  annual_rate_pct: string;
  term_months: bigint;
  start_date: string;
  instalment: bigint;
  status: LoanStatus;
}
interface InstalmentRow {
  number: bigint;
  due_date: string;
  opening_balance: bigint;
  payment: bigint;
  due_penalty: bigint;
  due_fee: bigint;
  due_interest: bigint;
  due_principal: bigint;
  closing_balance: bigint;
}

const toLoan = (r: LoanRow): LoanRecord => ({
  id: toNum(r.id),
  borrowerName: r.borrower_name,
  principal: r.principal,
  annualRatePct: r.annual_rate_pct,
  termMonths: toNum(r.term_months),
  startDate: r.start_date,
  instalment: r.instalment,
  status: r.status,
});

const toInstalment = (r: InstalmentRow): InstalmentRecord => ({
  number: toNum(r.number),
  dueDate: r.due_date,
  openingBalance: r.opening_balance,
  payment: r.payment,
  closingBalance: r.closing_balance,
  due: { penalty: r.due_penalty, fee: r.due_fee, interest: r.due_interest, principal: r.due_principal },
});

export function createLoanRepository(db: DB) {
  const stmt = {
    insert: db.prepare(
      `INSERT INTO loans (borrower_name, principal, annual_rate_pct, term_months, start_date, instalment, status)
       VALUES (@borrowerName, @principal, @annualRatePct, @termMonths, @startDate, @instalment, 'ACTIVE')`,
    ),
    insertInstalment: db.prepare(
      `INSERT INTO instalments (loan_id, number, due_date, opening_balance, payment, due_interest, due_principal, closing_balance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    byId: db.prepare('SELECT * FROM loans WHERE id = ?'),
    all: db.prepare('SELECT * FROM loans ORDER BY id DESC'),
    setStatus: db.prepare('UPDATE loans SET status = ? WHERE id = ?'),
    instalments: db.prepare('SELECT * FROM instalments WHERE loan_id = ? ORDER BY number'),
  };

  return {
    insert(loan: NewLoan, schedule: readonly ScheduleRow[]): number {
      const id = toNum(stmt.insert.run(loan).lastInsertRowid as bigint);
      for (const r of schedule)
        stmt.insertInstalment.run(id, r.number, r.dueDate, r.openingBalance, r.payment, r.interest, r.principal, r.closingBalance);
      return id;
    },

    findById(id: number): LoanRecord | undefined {
      const row = stmt.byId.get(id) as LoanRow | undefined;
      return row && toLoan(row);
    },

    findAll: () => (stmt.all.all() as LoanRow[]).map(toLoan),

    setStatus: (id: number, status: LoanStatus) => void stmt.setStatus.run(status, id),

    findInstalments: (loanId: number) => (stmt.instalments.all(loanId) as InstalmentRow[]).map(toInstalment),
  };
}

export type LoanRepository = ReturnType<typeof createLoanRepository>;
