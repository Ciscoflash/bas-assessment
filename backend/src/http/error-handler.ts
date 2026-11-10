import type { ErrorBody } from '../money/index.js';
import { zodToFieldErrors } from '../money/index.js';
import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from '../domain/errors.js';

/** One place that turns errors into HTTP responses with the shared ErrorBody shape. */
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, _req, reply) => {
    const send = (status: number, body: ErrorBody) => reply.status(status).send(body);

    if (err instanceof ZodError) return send(400, { error: 'Validation failed', errors: zodToFieldErrors(err) });
    if (err instanceof DomainError) return send(err.statusCode, { error: err.message, errors: err.fieldErrors });
    // Shared money code throws these for impossible inputs that slipped past validation.
    if (err instanceof RangeError || err instanceof TypeError) return send(400, { error: err.message });

    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return send(status, { error: (err as Error).message }); // e.g. malformed JSON

    app.log.error(err);
    return send(500, { error: 'Internal error' });
  });
}
