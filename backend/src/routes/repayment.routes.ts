import { paymentRequest, payoffRequest } from '../money/index.js';
import { created, idempotent } from '../http/idempotent.js';
import { idParam, parseBody } from '../http/request.js';
import type { RoutePlugin } from './types.js';

/** Repayments and early payoff. Each has a side-effect-free preview and an idempotent post. */
export const repaymentRoutes: RoutePlugin = async (app, { services: { loans, repayments, idempotency } }) => {
  app.get('/payments', async () => repayments.history());

  app.get('/loans/:id/payments', async (req) => repayments.history(idParam(req)));

  app.post('/loans/:id/payments/preview', async (req) => {
    const { amount, paymentDate } = parseBody(paymentRequest, req);
    return repayments.previewPayment(idParam(req), BigInt(amount), paymentDate);
  });

  app.post(
    '/loans/:id/payments',
    idempotent(idempotency, (req) => {
      const id = idParam(req);
      const { amount, paymentDate } = parseBody(paymentRequest, req);
      const result = repayments.postPayment(id, BigInt(amount), paymentDate);
      return created({ ...result, loan: loans.view(id, paymentDate) });
    }),
  );

  app.post('/loans/:id/payoff/preview', async (req) => {
    const { paymentDate } = parseBody(payoffRequest, req);
    return repayments.previewPayoff(idParam(req), paymentDate);
  });

  app.post(
    '/loans/:id/payoff',
    idempotent(idempotency, (req) => {
      const id = idParam(req);
      const { paymentDate } = parseBody(payoffRequest, req);
      const result = repayments.postPayoff(id, paymentDate);
      return created({ ...result, loan: loans.view(id, paymentDate) });
    }),
  );
};
