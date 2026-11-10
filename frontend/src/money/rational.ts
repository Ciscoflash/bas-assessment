/**
 * Exact rational arithmetic over BigInt. Every money calculation runs on these,
 * so intermediate values are never rounded and never touch a float.
 */
export interface Rational {
  readonly n: bigint;
  readonly d: bigint; // always > 0
}

const abs = (x: bigint) => (x < 0n ? -x : x);

function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function rat(n: bigint, d: bigint = 1n): Rational {
  if (d === 0n) throw new RangeError('Division by zero');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return g > 1n ? { n: n / g, d: d / g } : { n, d };
}

export const ZERO = rat(0n);
export const ONE = rat(1n);

export const add = (a: Rational, b: Rational) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Rational, b: Rational) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Rational, b: Rational) => rat(a.n * b.n, a.d * b.d);
export const div = (a: Rational, b: Rational) => {
  if (b.n === 0n) throw new RangeError('Division by zero');
  return rat(a.n * b.d, a.d * b.n);
};
export const pow = (a: Rational, e: number) => {
  if (!Number.isInteger(e) || e < 0) throw new RangeError('Exponent must be a non-negative integer');
  return rat(a.n ** BigInt(e), a.d ** BigInt(e));
};
export const isZero = (a: Rational) => a.n === 0n;

/**
 * Round half-up to an integer. For negative values this rounds half away from
 * zero (−2.5 → −3), so rounding is symmetric. Money values here are never negative.
 */
export function roundHalfUp(a: Rational): bigint {
  const sign = a.n < 0n ? -1n : 1n;
  const n = abs(a.n);
  return sign * ((2n * n + a.d) / (2n * a.d));
}
