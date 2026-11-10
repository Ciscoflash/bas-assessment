import { rat, type Rational } from './rational.js';

/** Annual rate as a percent string, e.g. "18" or "18.25" (≤ 4 decimal places). */
export const RATE_PATTERN = /^\d{1,3}(\.\d{1,4})?$/;
export const MIN_RATE_PCT = '0';
export const MAX_RATE_PCT = '100';

/** "18.25" → 0.1825 as an exact rational. Throws on anything that isn't a plain decimal. */
export function parseRatePercent(s: string): Rational {
  if (typeof s !== 'string' || !RATE_PATTERN.test(s)) throw new TypeError(`Invalid rate: ${String(s)}`);
  const [whole, frac = ''] = s.split('.');
  const scale = 10n ** BigInt(frac.length);
  const pctScaled = BigInt(whole!) * scale + BigInt(frac || '0');
  return rat(pctScaled, 100n * scale);
}

export function validateRatePercent(s: string): string | null {
  if (!RATE_PATTERN.test(s)) return 'Enter a rate like 18 or 18.25 (up to 4 decimal places)';
  const r = parseRatePercent(s);
  if (r.n > r.d) return 'Rate cannot exceed 100%';
  return null;
}
