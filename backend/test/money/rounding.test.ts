import { describe, expect, it } from 'vitest';
import { nairaInputToKobo, formatNaira, parseKobo, parseRatePercent, rat, roundHalfUp, validateRatePercent } from '../../src/money/index.js';

describe('roundHalfUp', () => {
  it.each([
    [5n, 2n, 3n], // 2.5 → 3
    [3n, 2n, 2n], // 1.5 → 2
    [1n, 2n, 1n], // 0.5 → 1
    [249_999n, 100_000n, 2n], // 2.49999 → 2
    [250_001n, 100_000n, 3n],
    [7n, 1n, 7n],
    [0n, 1n, 0n],
    [-5n, 2n, -3n], // symmetric: half away from zero
    [-249_999n, 100_000n, -2n],
  ])('%s/%s → %s', (n, d, expected) => {
    expect(roundHalfUp(rat(n, d))).toBe(expected);
  });
});

describe('kobo parsing', () => {
  it('accepts integer strings only', () => {
    expect(parseKobo('21063026')).toBe(21_063_026n);
    for (const bad of ['1.5', '1e3', '', ' 1', 'abc', '0x10']) expect(() => parseKobo(bad)).toThrow();
    // @ts-expect-error numbers are not accepted on the wire
    expect(() => parseKobo(100)).toThrow();
  });

  it('parses naira input with string maths (no float drift)', () => {
    expect(nairaInputToKobo('1,200,000')).toBe(120_000_000n);
    expect(nairaInputToKobo('0.1')).toBe(10n);
    expect(nairaInputToKobo('0.29')).toBe(29n); // 0.29 * 100 = 28.999999999999996 in floats
    expect(nairaInputToKobo('5000000000')).toBe(500_000_000_000n);
    expect(nairaInputToKobo('1.234')).toBeNull();
    expect(nairaInputToKobo('-1')).toBeNull();
    expect(nairaInputToKobo('')).toBeNull();
  });

  it('formats naira', () => {
    expect(formatNaira(21_063_026n)).toBe('₦210,630.26');
    expect(formatNaira(5n)).toBe('₦0.05');
    expect(formatNaira(-94_247n)).toBe('−₦942.47');
  });
});

describe('rates', () => {
  it('parses percent strings exactly', () => {
    expect(parseRatePercent('18')).toEqual(rat(18n, 100n));
    expect(parseRatePercent('18.25')).toEqual(rat(1825n, 10_000n));
    expect(parseRatePercent('0.5')).toEqual(rat(1n, 200n));
  });
  it('validates', () => {
    expect(validateRatePercent('60')).toBeNull();
    expect(validateRatePercent('100.0001')).not.toBeNull();
    expect(validateRatePercent('1.23456')).not.toBeNull();
    expect(validateRatePercent('-1')).not.toBeNull();
    expect(validateRatePercent('1e2')).not.toBeNull();
  });
});
