import {
  compareDates,
  invoiceAdvanceLines,
  invoiceSettlementLines,
  quoteInvoice,
  settleInvoice,
  type CreateInvoiceRequest,
  type InvoiceQuoteInput,
} from '../money/index.js';
import type { Tx } from '../db/transaction.js';
import { badRequest, conflict, notFound } from '../domain/errors.js';
import type { InvoiceRecord, InvoiceRepository } from '../repositories/invoice.repository.js';
import type { LedgerService } from './ledger.service.js';

export function createInvoiceService({ invoiceRepo, ledger, tx }: { invoiceRepo: InvoiceRepository; ledger: LedgerService; tx: Tx }) {
  function get(id: number): InvoiceRecord {
    const invoice = invoiceRepo.findById(id);
    if (!invoice) throw notFound('Invoice');
    return invoice;
  }

  const withJournal = (invoice: InvoiceRecord) => ({ ...invoice, journal: ledger.entriesForInvoice(invoice.id) });

  const quote = (input: InvoiceQuoteInput) => quoteInvoice(input);

  /** Fund the advance: recompute the quote server-side, persist, post Dr Invoice Receivables / Cr Cash. */
  function advance(req: CreateInvoiceRequest) {
    const q = quote({ faceValue: BigInt(req.faceValue), fundingDate: req.fundingDate, dueDate: req.dueDate });
    return tx(() => {
      const invoiceId = invoiceRepo.insert({ ...q, clientName: req.clientName, debtorName: req.debtorName ?? '' });
      const journalEntry = ledger.post({
        eventType: 'INVOICE_ADVANCE',
        effectiveDate: q.fundingDate,
        memo: `Advance to ${req.clientName}`,
        invoiceId,
        lines: invoiceAdvanceLines(q.advance),
      });
      return { invoiceId, journalEntry };
    });
  }

  function previewSettlement(id: number, settlementDate: string) {
    const invoice = get(id);
    if (invoice.status !== 'ADVANCED') throw conflict('This invoice is already settled');
    if (compareDates(settlementDate, invoice.fundingDate) < 0)
      throw badRequest('Settlement date cannot be before the funding date', 'settlementDate');
    const settlement = settleInvoice(invoice, settlementDate);
    return { settlement, journalLines: invoiceSettlementLines(settlement) };
  }

  function settle(id: number, settlementDate: string) {
    return tx(() => {
      const { settlement, journalLines } = previewSettlement(id, settlementDate);
      const journalEntry = ledger.post({
        eventType: 'INVOICE_SETTLEMENT',
        effectiveDate: settlementDate,
        memo:
          settlement.clientOwes > 0n
            ? `Settlement with shortfall: client owes ${settlement.clientOwes} kobo`
            : `Settlement: ${settlement.clientReceives} kobo payable to client`,
        invoiceId: id,
        lines: journalLines,
      });
      invoiceRepo.markSettled(id, settlement);
      return { settlement, journalEntry };
    });
  }

  return {
    quote,
    advance,
    previewSettlement,
    settle,
    view: (id: number) => withJournal(get(id)),
    list: () => invoiceRepo.findAll().map(withJournal),
  };
}

export type InvoiceService = ReturnType<typeof createInvoiceService>;
