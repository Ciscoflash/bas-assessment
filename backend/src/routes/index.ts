import { healthRoutes } from './health.routes.js';
import { invoiceRoutes } from './invoice.routes.js';
import { ledgerRoutes } from './ledger.routes.js';
import { loanRoutes } from './loan.routes.js';
import { repaymentRoutes } from './repayment.routes.js';
import { statementRoutes } from './statement.routes.js';
import type { RoutePlugin } from './types.js';

/** All API routes, mounted under /api by the app. */
export const apiRoutes: RoutePlugin = async (app, { services }) => {
  // Pass only the services down: forwarding all options would re-apply the /api prefix.
  for (const routes of [healthRoutes, loanRoutes, repaymentRoutes, statementRoutes, invoiceRoutes, ledgerRoutes]) {
    await app.register(routes, { services });
  }
};
