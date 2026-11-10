import { createLoanRequest, loanQuoteRequest } from '../money/index.js';
import { created, idempotent } from '../http/idempotent.js';
import { asOfQuery, idParam, parseBody } from '../http/request.js';
import { today } from '../lib/clock.js';
import type { RoutePlugin } from './types.js';

/** Term loan origination and reads. */
export const loanRoutes: RoutePlugin = async (app, { services: { loans, idempotency } }) => {
  // Stateless quote: the server's schedule, which the browser checks against its own preview.
  app.post('/loans/quote', async (req) => {
    const body = parseBody(loanQuoteRequest, req);
    return loans.quote({ ...body, principal: BigInt(body.principal) });
  });

  // Approve and disburse.
  app.post(
    '/loans',
    idempotent(idempotency, (req) => {
      const body = parseBody(createLoanRequest, req);
      const { loanId, journalEntry } = loans.originate(body);
      return created({ loan: loans.view(loanId, body.startDate), journalEntry });
    }),
  );

  app.get('/loans', async () => loans.list());

  app.get('/loans/:id', async (req) => loans.view(idParam(req), asOfQuery(req, today())));
};
