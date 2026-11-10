import { today } from '../lib/clock.js';
import type { RoutePlugin } from './types.js';

export const healthRoutes: RoutePlugin = async (app) => {
  app.get('/health', async () => ({ ok: true, today: today() }));
};
