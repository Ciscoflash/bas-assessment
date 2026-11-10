import type { Buckets, Kobo } from '../money/index.js';
import type { DB } from '../db/connection.js';
import { toNum } from '../db/mappers.js';

export type PaymentKind = 'PAYMENT' | 'PAYOFF';

export interface NewPayment {
  loanId: number;
  kind: PaymentKind;
  amount: Kobo;
  paymentDate: string;
  unappliedCredit: Kobo;
  journalEntryId: number;
}

/** A posted payment, with the totals it applied to each bucket. */
export interface PaymentRecord {
  id: number;
  loanId: number;
  borrowerName: string;
  kind: PaymentKind;
  amount: Kobo;
  paymentDate: string;
  unappliedCredit: Kobo;
  journalEntryId: number;
  applied: Buckets;
}

interface PaymentRow {
  id: bigint;
  loan_id: bigint;
  borrower_name: string;
  kind: PaymentKind;
  amount: bigint;
  payment_date: string;
  unapplied_credit: bigint;
  journal_entry_id: bigint;
  penalty: bigint;
  fee: bigint;
  interest: bigint;
  principal: bigint;
}

const toPayment = (r: PaymentRow): PaymentRecord => ({
  id: toNum(r.id),
  loanId: toNum(r.loan_id),
  borrowerName: r.borrower_name,
  kind: r.kind,
  amount: r.amount,
  paymentDate: r.payment_date,
  unappliedCredit: r.unapplied_credit,
  journalEntryId: toNum(r.journal_entry_id),
  applied: { penalty: r.penalty, fee: r.fee, interest: r.interest, principal: r.principal },
});

/** Per-instalment amounts: what a payment allocated, or what a payoff waived. */
export type InstalmentBuckets = Buckets & { number: number };

/** Both bucket tables share one shape, so one set of statements serves both. */
type BucketTable = 'payment_allocations' | 'payoff_waivers';

export function createPaymentRepository(db: DB) {
  const insertPayment = db.prepare(
    `INSERT INTO payments (loan_id, kind, amount, payment_date, unapplied_credit, journal_entry_id)
     VALUES (@loanId, @kind, @amount, @paymentDate, @unappliedCredit, @journalEntryId)`,
  );

  const bucketStatements = (table: BucketTable) => ({
    insert: db.prepare(
      `INSERT INTO ${table} (payment_id, loan_id, instalment_number, penalty, fee, interest, principal) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    sumByInstalment: db.prepare(
      `SELECT instalment_number AS n, SUM(penalty) AS penalty, SUM(fee) AS fee, SUM(interest) AS interest, SUM(principal) AS principal
       FROM ${table} WHERE loan_id = ? GROUP BY instalment_number`,
    ),
  });
  // Newest first. A NULL loan id means "all loans".
  const history = db.prepare(
    `SELECT p.id, p.loan_id, l.borrower_name, p.kind, p.amount, p.payment_date, p.unapplied_credit, p.journal_entry_id,
            COALESCE(SUM(a.penalty), 0) AS penalty, COALESCE(SUM(a.fee), 0) AS fee,
            COALESCE(SUM(a.interest), 0) AS interest, COALESCE(SUM(a.principal), 0) AS principal
     FROM payments p
     JOIN loans l ON l.id = p.loan_id
     LEFT JOIN payment_allocations a ON a.payment_id = p.id
     WHERE @loanId IS NULL OR p.loan_id = @loanId
     GROUP BY p.id
     ORDER BY p.payment_date DESC, p.id DESC
     LIMIT @limit`,
  );

  const tables = { payment_allocations: bucketStatements('payment_allocations'), payoff_waivers: bucketStatements('payoff_waivers') };

  const insertBuckets = (table: BucketTable, paymentId: number, loanId: number, rows: readonly InstalmentBuckets[]) => {
    for (const r of rows) tables[table].insert.run(paymentId, loanId, r.number, r.penalty, r.fee, r.interest, r.principal);
  };

  const sumByInstalment = (table: BucketTable, loanId: number): Map<number, Buckets> => {
    const rows = tables[table].sumByInstalment.all(loanId) as ({ n: bigint } & Buckets)[];
    return new Map(rows.map(({ n, ...b }) => [toNum(n), b]));
  };

  return {
    findHistory: (loanId: number | null, limit = 200): PaymentRecord[] =>
      (history.all({ loanId, limit }) as PaymentRow[]).map(toPayment),
    insert: (p: NewPayment): number => toNum(insertPayment.run(p).lastInsertRowid as bigint),
    insertAllocations: (paymentId: number, loanId: number, rows: readonly InstalmentBuckets[]) =>
      insertBuckets('payment_allocations', paymentId, loanId, rows),
    insertWaivers: (paymentId: number, loanId: number, rows: readonly InstalmentBuckets[]) =>
      insertBuckets('payoff_waivers', paymentId, loanId, rows),
    allocatedByInstalment: (loanId: number) => sumByInstalment('payment_allocations', loanId),
    waivedByInstalment: (loanId: number) => sumByInstalment('payoff_waivers', loanId),
  };
}

export type PaymentRepository = ReturnType<typeof createPaymentRepository>;
