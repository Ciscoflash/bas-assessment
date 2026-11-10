import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/connection.js';
import { stringify } from '../src/http/json.js';
import { createServices } from '../src/services/index.js';

/** Business rules exercised directly through the services, with no HTTP in the way. */
describe('services (no HTTP)', () => {
  const services = createServices(openDb());
  const loanReq = { borrowerName: 'Ada', principal: '120000000', annualRatePct: '18', termMonths: 6, startDate: '2026-01-15' };

  it('originate → pay → statement ties out', () => {
    const { loanId } = services.loans.originate(loanReq);
    services.repayments.postPayment(loanId, 21_063_026n, '2026-02-15');
    const st = services.statements.statement(loanId);
    expect(st.closingBalance).toBe(100_736_974n);
    expect(st.tiesOut).toBe(true);
    expect(services.loans.view(loanId, '2026-02-15').instalments[0]!.status).toBe('PAID');
  });

  it('a failed post rolls back completely (no orphan journal entry)', () => {
    const { loanId } = services.loans.originate(loanReq);
    const before = services.ledger.recentEntries(1000).length;
    expect(() => services.repayments.postPayment(loanId, 100n, '2025-01-01')).toThrow(/before the disbursement/);
    expect(services.ledger.recentEntries(1000).length).toBe(before);
  });

  it('payoff closes the loan and refuses further payments', () => {
    const { loanId } = services.loans.originate(loanReq);
    services.repayments.postPayoff(loanId, '2026-01-20');
    expect(services.loans.get(loanId).status).toBe('CLOSED');
    expect(() => services.repayments.previewPayment(loanId, 1n, '2026-02-01')).toThrow(/closed/);
  });

  it('idempotency runs the operation once and replays the stored body', () => {
    let runs = 0;
    const op = () => ({ statusCode: 201, body: { n: ++runs, amount: 5n } });
    const a = services.idempotency.runOnce('key-12345678', 'scope', { x: 1 }, op);
    const b = services.idempotency.runOnce('key-12345678', 'scope', { x: 1 }, op);
    expect(runs).toBe(1);
    expect(b).toMatchObject({ replayed: true, body: { n: 1, amount: '5' } });
    expect(a.replayed).toBe(false);
    expect(() => services.idempotency.runOnce('key-12345678', 'scope', { x: 2 }, op)).toThrow(/different request/);
  });
});

describe('JSON money contract', () => {
  it('serialises every bigint as a decimal string, nested or not', () => {
    expect(stringify({ a: 1n, b: [2n, { c: 30000000000000000001n }], d: 'x', e: 3 })).toBe('{"a":"1","b":["2",{"c":"30000000000000000001"}],"d":"x","e":3}');
  });
});
