import type { InvoiceQuote, InvoiceSettlement } from '../money/index.js';
import type { DB } from '../db/connection.js';
import { toNum } from '../db/mappers.js';

export type InvoiceStatus = 'ADVANCED' | 'SETTLED';

export interface InvoiceRecord extends InvoiceQuote {
  id: number;
  clientName: string;
  debtorName: string;
  status: InvoiceStatus;
  settlement: InvoiceSettlement | null;
}
export type NewInvoice = InvoiceQuote & { clientName: string; debtorName: string };

interface InvoiceRow {
  id: bigint;
  client_name: string;
  debtor_name: string;
  face_value: bigint;
  funding_date: string;
  due_date: string;
  tenor_days: bigint;
  advance: bigint;
  reserve: bigint;
  discount_fee: bigint;
  status: InvoiceStatus;
  settlement_date: string | null;
  days_overdue: bigint | null;
  penalty: bigint | null;
  total_charges: bigint | null;
  client_receives: bigint | null;
  client_owes: bigint | null;
}

function toInvoice(r: InvoiceRow): InvoiceRecord {
  const quote: InvoiceQuote = {
    faceValue: r.face_value,
    fundingDate: r.funding_date,
    dueDate: r.due_date,
    tenorDays: toNum(r.tenor_days),
    advance: r.advance,
    reserve: r.reserve,
    discountFee: r.discount_fee,
  };
  const settled = r.status === 'SETTLED';
  return {
    id: toNum(r.id),
    clientName: r.client_name,
    debtorName: r.debtor_name,
    status: r.status,
    ...quote,
    settlement: settled
      ? {
          settlementDate: r.settlement_date!,
          daysOverdue: toNum(r.days_overdue!),
          cashReceived: r.face_value,
          advance: r.advance,
          reserve: r.reserve,
          discountFee: r.discount_fee,
          penalty: r.penalty!,
          totalCharges: r.total_charges!,
          clientReceives: r.client_receives!,
          clientOwes: r.client_owes!,
        }
      : null,
  };
}

export function createInvoiceRepository(db: DB) {
  const stmt = {
    insert: db.prepare(
      `INSERT INTO invoices (client_name, debtor_name, face_value, funding_date, due_date, tenor_days, advance, reserve, discount_fee, status)
       VALUES (@clientName, @debtorName, @faceValue, @fundingDate, @dueDate, @tenorDays, @advance, @reserve, @discountFee, 'ADVANCED')`,
    ),
    byId: db.prepare('SELECT * FROM invoices WHERE id = ?'),
    all: db.prepare('SELECT * FROM invoices ORDER BY id DESC'),
    markSettled: db.prepare(
      `UPDATE invoices SET status = 'SETTLED', settlement_date = @settlementDate, days_overdue = @daysOverdue, penalty = @penalty,
         total_charges = @totalCharges, client_receives = @clientReceives, client_owes = @clientOwes
       WHERE id = @id`,
    ),
  };

  return {
    insert: (invoice: NewInvoice): number => toNum(stmt.insert.run(invoice).lastInsertRowid as bigint),

    findById(id: number): InvoiceRecord | undefined {
      const row = stmt.byId.get(id) as InvoiceRow | undefined;
      return row && toInvoice(row);
    },

    findAll: () => (stmt.all.all() as InvoiceRow[]).map(toInvoice),

    markSettled(id: number, s: InvoiceSettlement) {
      stmt.markSettled.run({
        id,
        settlementDate: s.settlementDate,
        daysOverdue: s.daysOverdue,
        penalty: s.penalty,
        totalCharges: s.totalCharges,
        clientReceives: s.clientReceives,
        clientOwes: s.clientOwes,
      });
    },
  };
}

export type InvoiceRepository = ReturnType<typeof createInvoiceRepository>;
