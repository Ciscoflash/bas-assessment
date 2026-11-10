import { createHash } from 'node:crypto';
import type { Tx } from '../db/transaction.js';
import { unprocessable } from '../domain/errors.js';
import type { IdempotencyRepository } from '../repositories/idempotency.repository.js';

export interface Outcome {
  statusCode: number;
  body: unknown;
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');

/**
 * Run an operation at most once per (key, scope). The lookup, the work and the
 * stored response share one transaction; better-sqlite3 is synchronous, so two
 * racing requests can't both pass the lookup. Failures roll back, so a failed
 * request can be retried with the same key.
 */
export function createIdempotencyService({
  repo,
  tx,
  serialize,
}: {
  repo: IdempotencyRepository;
  tx: Tx;
  /** How a response body is stored (must match what the client receives). */
  serialize: (body: unknown) => string;
}) {
  function runOnce(key: string, scope: string, request: unknown, operation: () => Outcome): Outcome & { replayed: boolean } {
    const requestHash = hash(request);
    return tx(() => {
      const existing = repo.find(key, scope);
      if (existing) {
        if (existing.requestHash !== requestHash) throw unprocessable('This Idempotency-Key was already used for a different request');
        return { statusCode: existing.statusCode, body: JSON.parse(existing.responseJson), replayed: true };
      }
      const outcome = operation();
      repo.insert({ key, scope, requestHash, statusCode: outcome.statusCode, responseJson: serialize(outcome.body) });
      return { ...outcome, replayed: false };
    });
  }

  return { runOnce };
}

export type IdempotencyService = ReturnType<typeof createIdempotencyService>;
