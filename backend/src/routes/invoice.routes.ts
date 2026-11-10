import { createInvoiceRequest, invoiceQuoteRequest, settlementRequest } from '../money/index.js';
import { created, idempotent } from '../http/idempotent.js';
import { idParam, parseBody } from '../http/request.js';
import type { RoutePlugin } from './types.js';

/** Product A: invoice financing (quote, advance, settlement). */
export const invoiceRoutes: RoutePlugin = async (app, { services: { invoices, idempotency } }) => {
  app.post('/invoices/quote', async (req) => {
    const { faceValue, fundingDate, dueDate } = parseBody(invoiceQuoteRequest, req);
    return invoices.quote({ faceValue: BigInt(faceValue), fundingDate, dueDate });
  });

  app.post(
    '/invoices',
    idempotent(idempotency, (req) => {
      const { invoiceId, journalEntry } = invoices.advance(parseBody(createInvoiceRequest, req));
      return created({ invoice: invoices.view(invoiceId), journalEntry });
    }),
  );

  app.get('/invoices', async () => invoices.list());

  app.get('/invoices/:id', async (req) => invoices.view(idParam(req)));

  app.post('/invoices/:id/settlement/preview', async (req) => {
    const { settlementDate } = parseBody(settlementRequest, req);
    return invoices.previewSettlement(idParam(req), settlementDate);
  });

  app.post(
    '/invoices/:id/settlement',
    idempotent(idempotency, (req) => {
      const id = idParam(req);
      const { settlementDate } = parseBody(settlementRequest, req);
      return created({ ...invoices.settle(id, settlementDate), invoice: invoices.view(id) });
    }),
  );
};
