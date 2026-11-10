/**
 * Money is always an integer number of kobo, held as `bigint` in code and as a
 * decimal integer string on the wire ("21063026"). ₦1 = 100 kobo.
 */
export type Kobo = bigint;

const KOBO_WIRE = /^-?\d+$/;

/** Strict wire parser: accepts only an integer string. */
export function parseKobo(s: string): Kobo {
  if (typeof s !== 'string' || !KOBO_WIRE.test(s)) throw new TypeError(`Invalid kobo amount: ${String(s)}`);
  return BigInt(s);
}

export const koboToWire = (k: Kobo): string => k.toString();

const NAIRA_INPUT = /^\d+(\.\d{1,2})?$/;

/**
 * Parse what a person types in naira ("1,200,000.5") into kobo using string
 * maths only. Returns null if it isn't a valid non-negative amount with at most 2 dp.
 */
export function nairaInputToKobo(input: string): Kobo | null {
  const s = input.replace(/[,\s₦]/g, '');
  if (!NAIRA_INPUT.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return BigInt(whole!) * 100n + BigInt(frac.padEnd(2, '0'));
}

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 21063026n → "₦210,630.26" */
export function formatNaira(k: Kobo): string {
  const neg = k < 0n;
  const a = neg ? -k : k;
  const whole = (a / 100n).toString();
  const frac = (a % 100n).toString().padStart(2, '0');
  return `${neg ? '−' : ''}₦${group(whole)}.${frac}`;
}

/** 21063026n → "21,063,026" (raw kobo, grouped) */
export function formatKobo(k: Kobo): string {
  const neg = k < 0n;
  return `${neg ? '−' : ''}${group((neg ? -k : k).toString())}`;
}

/** Kobo → naira input text without grouping ("1200000.00" → "1200000"). */
export function koboToNairaInput(k: Kobo): string {
  const whole = (k / 100n).toString();
  const frac = (k % 100n).toString().padStart(2, '0');
  return frac === '00' ? whole : `${whole}.${frac}`;
}

export const sum = (xs: readonly Kobo[]): Kobo => xs.reduce((a, b) => a + b, 0n);
export const max = (a: Kobo, b: Kobo): Kobo => (a > b ? a : b);
export const min = (a: Kobo, b: Kobo): Kobo => (a < b ? a : b);
