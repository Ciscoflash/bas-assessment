/**
 * Wire encoding. Money is a bigint in memory and a decimal integer string in JSON.
 * `toWire` turns every bigint in a structure into a string; the zod response
 * schemas in schemas.ts turn them back into bigints on the client.
 */
export type Wire<T> = T extends bigint
  ? string
  : T extends (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

export function toWire<T>(value: T): Wire<T> {
  if (typeof value === 'bigint') return value.toString() as Wire<T>;
  if (Array.isArray(value)) return value.map(toWire) as Wire<T>;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toWire(v);
    return out as Wire<T>;
  }
  return value as Wire<T>;
}
