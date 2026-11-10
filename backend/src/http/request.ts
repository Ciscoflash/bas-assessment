import type { FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';
import { isValidIsoDate } from '../money/index.js';
import { notFound } from '../domain/errors.js';

/** Validate the body with a shared schema. A ZodError becomes a 400 with field errors (see error-handler). */
export const parseBody = <T>(schema: ZodType<T, any, any>, req: FastifyRequest): T => schema.parse(req.body);

/** Positive integer `:id` route param, or 404. */
export function idParam(req: FastifyRequest): number {
  const id = Number((req.params as { id?: string }).id);
  if (!Number.isSafeInteger(id) || id < 1) throw notFound('Resource');
  return id;
}

/** Optional `?asOf=YYYY-MM-DD`, falling back to the given date. */
export function asOfQuery(req: FastifyRequest, fallback: string): string {
  const asOf = (req.query as { asOf?: string }).asOf;
  return asOf && isValidIsoDate(asOf) ? asOf : fallback;
}
