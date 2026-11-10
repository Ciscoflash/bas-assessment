import { idParam } from '../http/request.js';
import type { RoutePlugin } from './types.js';

export const statementRoutes: RoutePlugin = async (app, { services: { statements } }) => {
  app.get('/loans/:id/statement', async (req) => statements.statement(idParam(req)));
};
