import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ONE, ZERO, add, annuityInstalment, buildSchedule, monthlyRate, pow } from '../../src/money/index.js';

describe('Worked Example 1 (brief §2)', () => {
  const s = buildSchedule({ principal: 120_000_000n, annualRatePct: '18', termMonths: 6, startDate: '2026-01-15' });

  it('instalment and every row match to the kobo', () => {
    expect(s.instalment).toBe(21_063_026n);
    const expected = [
      [21_063_026n, 1_800_000n, 19_263_026n, 100_736_974n],
      [21_063_026n, 1_511_055n, 19_551_971n, 81_185_003n],
      [21_063_026n, 1_217_775n, 19_845_251n, 61_339_752n],
      [21_063_026n, 920_096n, 20_142_930n, 41_196_822n],
      [21_063_026n, 617_952n, 20_445_074n, 20_751_748n],
      [21_063_024n, 311_276n, 20_751_748n, 0n],
    ];
    expect(s.rows.map((r) => [r.payment, r.interest, r.principal, r.closingBalance])).toEqual(expected);
  });

  it('total interest is 6,378,154', () => {
    expect(s.totalInterest).toBe(6_378_154n);
  });

  it('due dates are monthly from the start date', () => {
    expect(s.rows.map((r) => r.dueDate)).toEqual(['2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15', '2026-07-15']);
  });
});

describe('rounding points', () => {
  it('rounds per-period interest half-up (x.5 → up)', () => {
    // 12% → i = 1%. 150 kobo × 1% = 1.5 → 2;  149 × 1% = 1.49 → 1
    expect(buildSchedule({ principal: 150n, annualRatePct: '12', termMonths: 1, startDate: '2026-01-01' }).rows[0]!.interest).toBe(2n);
    expect(buildSchedule({ principal: 149n, annualRatePct: '12', termMonths: 1, startDate: '2026-01-01' }).rows[0]!.interest).toBe(1n);
    expect(buildSchedule({ principal: 50n, annualRatePct: '12', termMonths: 1, startDate: '2026-01-01' }).rows[0]!.interest).toBe(1n);
  });

  it('rounds the instalment once, from the exact value', () => {
    // n = 1: instalment = P(1+i) exactly. 150 × 1.01 = 151.5 → 152
    expect(annuityInstalment(150n, monthlyRate('12'), 1)).toBe(152n);
    // zero rate falls back to P/n: 10/4 = 2.5 → 3
    expect(annuityInstalment(10n, monthlyRate('0'), 4)).toBe(3n);
  });

  it('1-month term: single payment of principal + interest', () => {
    const s = buildSchedule({ principal: 100_000n, annualRatePct: '24', termMonths: 1, startDate: '2026-01-01' });
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({ interest: 2_000n, principal: 100_000n, payment: 102_000n, closingBalance: 0n });
  });

  it('zero-rate loan splits principal evenly, remainder on the last', () => {
    const s = buildSchedule({ principal: 1_000n, annualRatePct: '0', termMonths: 3, startDate: '2026-01-01' });
    expect(s.rows.map((r) => r.payment)).toEqual([333n, 333n, 334n]);
  });
});

/**
 * Invariants over generated cases in the brief's ranges: ₦1,000–₦5bn, 0.5%–60% with
 * up to 4 dp, 1–60 months. Cross-checking against the browser's separate copy is in parity/.
 */
export const loanCaseArb = fc.record({
  principal: fc.bigInt({ min: 100_000n, max: 500_000_000_000n }),
  // rate in 1/10000ths of a percent: 0.5000% .. 60.0000%
  rateTenThousandths: fc.integer({ min: 5_000, max: 600_000 }),
  termMonths: fc.integer({ min: 1, max: 60 }),
});
export const rateString = (t: number) => {
  const whole = Math.floor(t / 10_000);
  const frac = String(t % 10_000).padStart(4, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : String(whole);
};

describe('schedule invariants (500 generated cases)', () => {
  it('principal sums to P, ends at 0, only the last instalment differs, no negatives', () => {
    fc.assert(
      fc.property(loanCaseArb, ({ principal, rateTenThousandths, termMonths }) => {
        const s = buildSchedule({ principal, annualRatePct: rateString(rateTenThousandths), termMonths, startDate: '2026-01-31' });
        expect(s.rows).toHaveLength(termMonths);
        expect(s.rows.reduce((a, r) => a + r.principal, 0n)).toBe(principal);
        expect(s.rows.at(-1)!.closingBalance).toBe(0n);
        for (const [k, r] of s.rows.entries()) {
          expect(r.payment).toBe(r.interest + r.principal);
          expect(r.closingBalance).toBe(r.openingBalance - r.principal);
          expect(r.interest >= 0n && r.principal >= 0n).toBe(true);
          if (k < s.rows.length - 1) expect(r.payment).toBe(s.instalment);
          if (k > 0) expect(r.openingBalance).toBe(s.rows[k - 1]!.closingBalance);
        }
        // The last instalment only differs by accumulated rounding: each period rounds by
        // < 1 kobo, and that error compounds at (1+i), so |drift| ≤ Σ_{k<n} (1+i)^k.
        const drift = s.rows.at(-1)!.payment - s.instalment;
        const q = add(ONE, monthlyRate(rateString(rateTenThousandths)));
        let bound = ZERO;
        for (let k = 0; k < termMonths; k++) bound = add(bound, pow(q, k));
        const absDrift = drift < 0n ? -drift : drift;
        expect(absDrift * bound.d <= bound.n).toBe(true);
        expect(s.totalPayment).toBe(principal + s.totalInterest);
      }),
      { numRuns: 500, seed: 20261109 },
    );
  });
});
