import type { RoutePlugin } from './types.js';

/** Read-only views of the general ledger. */
export const ledgerRoutes: RoutePlugin = async (app, { services: { ledger } }) => {
  app.get('/ledger/journal', async () => ledger.recentEntries());
  app.get('/ledger/trial-balance', async () => ledger.trialBalance());
};
