import { zodToFieldErrors } from '../money';
import type { ZodType } from 'zod';

/** Validate with the same zod schema the server uses; returns field → message. */
export function validate<T>(schema: ZodType<T, any, any>, value: unknown): { ok: true; data: T } | { ok: false; errors: Record<string, string> } {
  const r = schema.safeParse(value);
  if (r.success) return { ok: true, data: r.data };
  const errors: Record<string, string> = {};
  for (const e of zodToFieldErrors(r.error)) errors[e.field] ??= e.message;
  return { ok: false, errors };
}
