import { describe, expect, it } from 'vitest';
import {
  allocate,
  applyAllocation,
  buildSchedule,
  emptyBuckets,
  outstandingPrincipal,
  payoffQuote,
  type InstalmentState,
} from '../../src/money/index.js';

const fromSchedule = (): InstalmentState[] =>
  buildSchedule({ principal: 120_000_000n, annualRatePct: '18', termMonths: 6, startDate: '2026-01-15' }).rows.map((r) => ({
    number: r.number,
    dueDate: r.dueDate,
    due: { penalty: 0n, fee: 0n, interest: r.interest, principal: r.principal },
    paid: emptyBuckets(),
    waived: emptyBuckets(),
  }));

describe('payment waterfall', () => {
  it('partial payment: interest first, then principal', () => {
    const a = allocate(fromSchedule(), 2_000_000n, '2026-02-15');
    expect(a.lines).toEqual([{ number: 1, dueDate: '2026-02-15', penalty: 0n, fee: 0n, interest: 1_800_000n, principal: 200_000n }]);
    expect(a.unappliedCredit).toBe(0n);
  });

  it('payment smaller than interest goes all to interest', () => {
    const a = allocate(fromSchedule(), 500n, '2026-02-15');
    expect(a.totals).toEqual({ penalty: 0n, fee: 0n, interest: 500n, principal: 0n });
  });

  it('exact instalment clears it', () => {
    const a = allocate(fromSchedule(), 21_063_026n, '2026-02-15');
    expect(a.totals).toEqual({ penalty: 0n, fee: 0n, interest: 1_800_000n, principal: 19_263_026n });
    expect(a.unappliedCredit).toBe(0n);
  });

  it('overpayment: surplus becomes unapplied credit, not a prepayment of instalment 2', () => {
    const a = allocate(fromSchedule(), 25_000_000n, '2026-02-20');
    expect(a.lines).toHaveLength(1);
    expect(a.unappliedCredit).toBe(25_000_000n - 21_063_026n);
  });

  it('payment before anything is due is entirely unapplied credit', () => {
    const a = allocate(fromSchedule(), 1_000_000n, '2026-02-14');
    expect(a.lines).toHaveLength(0);
    expect(a.unappliedCredit).toBe(1_000_000n);
  });

  it('two overdue instalments: oldest is cleared first', () => {
    const a = allocate(fromSchedule(), 22_000_000n, '2026-03-20');
    expect(a.lines.map((l) => l.number)).toEqual([1, 2]);
    expect(a.lines[0]).toMatchObject({ interest: 1_800_000n, principal: 19_263_026n });
    expect(a.lines[1]).toMatchObject({ interest: 936_974n, principal: 0n });
  });

  it('follows penalty → fee → interest → principal inside an instalment', () => {
    const s = fromSchedule();
    s[0]!.due.penalty = 300n;
    s[0]!.due.fee = 200n;
    expect(allocate(s, 250n, '2026-02-15').totals).toEqual({ penalty: 250n, fee: 0n, interest: 0n, principal: 0n });
    expect(allocate(s, 400n, '2026-02-15').totals).toEqual({ penalty: 300n, fee: 100n, interest: 0n, principal: 0n });
    expect(allocate(s, 1_000n, '2026-02-15').totals).toEqual({ penalty: 300n, fee: 200n, interest: 500n, principal: 0n });
  });

  it('respects amounts already paid', () => {
    let s = fromSchedule();
    s = applyAllocation(s, allocate(s, 1_000_000n, '2026-02-15'));
    const a = allocate(s, 1_000_000n, '2026-02-15');
    expect(a.totals).toEqual({ penalty: 0n, fee: 0n, interest: 800_000n, principal: 200_000n });
  });

  it('paying every instalment on time leaves principal 0 and no credit', () => {
    let s = fromSchedule();
    const sched = buildSchedule({ principal: 120_000_000n, annualRatePct: '18', termMonths: 6, startDate: '2026-01-15' });
    for (const r of sched.rows) {
      const a = allocate(s, r.payment, r.dueDate);
      expect(a.unappliedCredit).toBe(0n);
      s = applyAllocation(s, a);
    }
    expect(outstandingPrincipal(s)).toBe(0n);
  });

  it('rejects non-positive amounts', () => {
    expect(() => allocate(fromSchedule(), 0n, '2026-02-15')).toThrow();
  });
});

describe('early payoff', () => {
  it('before any instalment is due: principal only, all interest waived', () => {
    const q = payoffQuote(fromSchedule(), '2026-02-01');
    expect(q.total).toBe(120_000_000n);
    expect(q.totals.interest).toBe(0n);
    expect(q.interestWaived).toBe(6_378_154n);
  });

  it('after 2 instalments paid, mid-period: remaining principal', () => {
    let s = fromSchedule();
    s = applyAllocation(s, allocate(s, 21_063_026n, '2026-02-15'));
    s = applyAllocation(s, allocate(s, 21_063_026n, '2026-03-15'));
    const q = payoffQuote(s, '2026-04-01');
    expect(q.total).toBe(81_185_003n);
    expect(q.interestWaived).toBe(1_217_775n + 920_096n + 617_952n + 311_276n);
  });

  it('with an overdue unpaid instalment: collects its interest too', () => {
    const q = payoffQuote(fromSchedule(), '2026-02-20');
    expect(q.totals.interest).toBe(1_800_000n);
    expect(q.total).toBe(120_000_000n + 1_800_000n);
  });

  it('partially paid due instalment: only what is still owed', () => {
    let s = fromSchedule();
    s = applyAllocation(s, allocate(s, 1_000_000n, '2026-02-15'));
    const q = payoffQuote(s, '2026-02-15');
    expect(q.totals.interest).toBe(800_000n);
    expect(q.total).toBe(120_000_000n + 800_000n);
  });
});
