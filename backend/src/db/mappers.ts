/** Row helpers: ids/counts come back from SQLite as BigInt; convert at the repository edge. */
export const toNum = (v: bigint | number): number => Number(v);
export const toNumOrNull = (v: bigint | number | null): number | null => (v === null ? null : Number(v));
export const toUndefined = <T>(v: T | null): T | undefined => (v === null ? undefined : v);
