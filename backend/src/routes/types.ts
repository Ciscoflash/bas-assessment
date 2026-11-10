import type { FastifyPluginAsync } from 'fastify';
import type { Services } from '../services/index.js';

export interface RouteOptions {
  services: Services;
}

/** Every route module is a Fastify plugin that receives the services it needs. */
export type RoutePlugin = FastifyPluginAsync<RouteOptions>;
