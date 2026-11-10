import type { ErrorBody, FieldError } from '../money';
import type { ZodType } from 'zod';
import { env } from '../env';

/** An HTTP error from the API, carrying any field-level validation errors. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly fieldErrors: FieldError[] = [],
  ) {
    super(message);
  }
  /** Map server errors onto form fields; anything without a field becomes a form-level error. */
  byField(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const e of this.fieldErrors) out[e.field] ??= e.message;
    return out;
  }
}

interface Options<T> {
  body?: unknown;
  idempotencyKey?: string;
  schema?: ZodType<T, any, any>;
}

/** Call the backend. `path` is relative to the API base URL, e.g. "/loans/quote". */
export async function api<T = unknown>(method: 'GET' | 'POST', path: string, opts: Options<T> = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
  const res = await fetch(`${env.apiBaseUrl}${path}`, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = (json ?? {}) as Partial<ErrorBody>;
    throw new ApiError(res.status, err.error ?? `Request failed (${res.status})`, err.errors ?? []);
  }
  // Decode the response: kobo strings → bigint via the shared schemas.
  return opts.schema ? opts.schema.parse(json) : (json as T);
}

export const newIdempotencyKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
