import { describe, expect, it } from 'vitest';
import { addDays, discountFee, invoiceAdvance, latePenalty, quoteInvoice, settleInvoice } from '../../src/money/index.js';

describe('visible example: invoice shortfall (brief §3)', () => {
  const q = quoteInvoice({ faceValue: 100_000_000n, fundingDate: '2026-01-01', dueDate: '2026-03-02' });

  it('quote', () => {
    expect(q).toMatchObject({ tenorDays: 60, advance: 80_000_000n, reserve: 20_000_000n, discountFee: 4_734_247n });
    expect(latePenalty(q.advance, 1)).toBe(160_000n);
  });

  it.each([
    [0, 0n, 4_734_247n, 15_265_753n, 0n],
    [95, 15_200_000n, 19_934_247n, 65_753n, 0n],
    [96, 15_360_000n, 20_094_247n, 0n, 94_247n],
  ])('%i days overdue', (days, penalty, charges, receives, owes) => {
    const s = settleInvoice(q, addDays(q.dueDate, days));
    expect(s).toMatchObject({ daysOverdue: days, penalty, totalCharges: charges, clientReceives: receives, clientOwes: owes });
  });

  it('settling early or on the due date has no penalty', () => {
    expect(settleInvoice(q, '2026-02-01').penalty).toBe(0n);
    expect(settleInvoice(q, q.dueDate).daysOverdue).toBe(0);
  });

  it('charges exactly equal to the reserve: client receives 0 and owes 0', () => {
    // reserve 20,000,000 − fee 4,734,247 = 15,265,753 → would need 95.41 days; build an exact one instead
    const exact = { ...q, discountFee: 20_000_000n - 160_000n * 10n };
    const s = settleInvoice(exact, addDays(q.dueDate, 10));
    expect(s.clientReceives).toBe(0n);
    expect(s.clientOwes).toBe(0n);
  });

  it('never returns negative amounts', () => {
    for (let d = 0; d < 400; d += 7) {
      const s = settleInvoice(q, addDays(q.dueDate, d));
      expect(s.clientReceives >= 0n && s.clientOwes >= 0n).toBe(true);
      expect(s.clientReceives - s.clientOwes).toBe(s.reserve - s.totalCharges);
    }
  });
});

describe('invoice rounding points', () => {
  it('advance = 80% half-up', () => {
    expect(invoiceAdvance(100n)).toBe(80n);
    expect(invoiceAdvance(1n)).toBe(1n); // 0.8 → 1
    expect(invoiceAdvance(3n)).toBe(2n); // 2.4 → 2
  });
  it('fee rounded once from the exact value', () => {
    // 80,000,000 × 0.36 × 60/365 = 4,734,246.575… → 4,734,247
    expect(discountFee(80_000_000n, 60)).toBe(4_734_247n);
    // 1,825 × 0.36 × 1/365 = 1.8 → 2
    expect(discountFee(1_825n, 1)).toBe(2n);
    // 3,650,000 × 0.36 × 1/365 = 3,600 exactly
    // 125 × 0.36 × 365/365 = 45; 1,250 × 0.36 × 1/365 = 1.2328… → 1
    expect(discountFee(1_250n, 1)).toBe(1n);
    expect(discountFee(3_650_000n, 1)).toBe(3_600n);
  });
  it('penalty is rounded once over all days, not per day', () => {
    // advance 250 → 0.5 kobo/day. 3 days = 1.5 → 2 (per-day rounding would give 3)
    expect(latePenalty(250n, 3)).toBe(2n);
    expect(latePenalty(250n, 1)).toBe(1n);
    expect(latePenalty(250n, 0)).toBe(0n);
  });
});
