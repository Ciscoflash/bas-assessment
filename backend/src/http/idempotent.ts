import type { FastifyReply, FastifyRequest } from 'fastify';
import { badRequest } from '../domain/errors.js';
import type { IdempotencyService, Outcome } from '../services/idempotency.service.js';

const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/;

export function idempotencyKey(req: FastifyRequest): string {
  const raw = req.headers['idempotency-key'];
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (!key) throw badRequest('Idempotency-Key header is required');
  if (!KEY_PATTERN.test(key)) throw badRequest('Idempotency-Key must be 8–128 characters of [A-Za-z0-9_-:.]');
  return key;
}

export const created = (body: unknown): Outcome => ({ statusCode: 201, body });

/**
 * Wrap a posting handler so it runs at most once per Idempotency-Key. The scope is
 * the route pattern plus its params, so one key can't collide across loans.
 * Replays carry an `Idempotent-Replay: true` header.
 */
export function idempotent(service: IdempotencyService, handler: (req: FastifyRequest) => Outcome) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const key = idempotencyKey(req);
    const scope = `${req.method} ${req.routeOptions.url}:${JSON.stringify(req.params ?? {})}`;
    const result = service.runOnce(key, scope, req.body, () => handler(req));
    if (result.replayed) reply.header('Idempotent-Replay', 'true');
    return reply.status(result.statusCode).send(result.body);
  };
}
