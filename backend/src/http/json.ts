/**
 * The money contract on the way out: every bigint (kobo) becomes a decimal string.
 * Used as Fastify's reply serializer, so routes return domain objects as they are.
 */
export const stringify = (value: unknown): string =>
  JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v));
