/** The browser's own copy of the money code, checked against the brief's examples. */
import { describe, expect, it } from 'vitest';
import { addDays, buildSchedule, formatNaira, nairaInputToKobo, quoteInvoice, settleInvoice } from '../src/money';

describe('frontend money copy', () => {
  it('Worked Example 1 to the kobo', () => {
    const s = buildSchedule({ principal: 120_000_000n, annualRatePct: '18', termMonths: 6, startDate: '2026-01-15' });
    expect(s.instalment).toBe(21_063_026n);
    expect(s.totalInterest).toBe(6_378_154n);
    expect(s.rows.map((r) => r.payment)).toEqual([21_063_026n, 21_063_026n, 21_063_026n, 21_063_026n, 21_063_026n, 21_063_024n]);
  });

  it('invoice shortfall example', () => {
    const q = quoteInvoice({ faceValue: 100_000_000n, fundingDate: '2026-01-01', dueDate: '2026-03-02' });
    expect(q.discountFee).toBe(4_734_247n);
    expect(settleInvoice(q, addDays(q.dueDate, 96))).toMatchObject({ clientReceives: 0n, clientOwes: 94_247n });
  });

  it('parses naira input without floats and formats kobo', () => {
    expect(nairaInputToKobo('1,200,000')).toBe(120_000_000n);
    expect(nairaInputToKobo('0.29')).toBe(29n);
    expect(nairaInputToKobo('1.234')).toBeNull();
    expect(formatNaira(21_063_026n)).toBe('₦210,630.26');
  });
});
