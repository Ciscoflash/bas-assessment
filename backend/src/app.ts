import cors from '@fastify/cors';
import Fastify from 'fastify';
import { openDb, type DB } from './db/connection.js';
import { registerErrorHandler } from './http/error-handler.js';
import { stringify } from './http/json.js';
import { apiRoutes } from './routes/index.js';
import { createServices } from './services/index.js';

export interface AppOptions {
  db?: DB;
  /** SQLite file; defaults to an in-memory database (what the tests use). */
  dbPath?: string;
  /** Pino log level; omit to disable logging. */
  logLevel?: string;
  /** Origins allowed to call the API cross-origin. */
  corsOrigins?: string[];
}

/**
 * Build the HTTP app. Layers, outside in:
 *   routes/        HTTP only: parse + validate input, call one service, return its result
 *   http/          cross-cutting HTTP concerns: errors, idempotency keys, bigint-safe JSON
 *   services/      business rules and transactions (no SQL, no HTTP)
 *   repositories/  SQL only (no business rules)
 *   money/         pure money maths (authoritative; the browser keeps its own preview copy)
 */
export function buildApp(opts: AppOptions = {}) {
  const db = opts.db ?? openDb(opts.dbPath);
  const services = createServices(db);

  const app = Fastify({ logger: opts.logLevel ? { level: opts.logLevel } : false });
  app.register(cors, {
    origin: opts.corsOrigins ?? false,
    allowedHeaders: ['content-type', 'idempotency-key'],
    exposedHeaders: ['idempotent-replay'],
  });
  app.setReplySerializer(stringify);
  registerErrorHandler(app);
  app.register(apiRoutes, { prefix: '/api', services });

  return { app, db, services };
}
