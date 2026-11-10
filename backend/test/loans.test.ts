import { afterAll, describe, expect, it } from 'vitest';
import { exampleLoan, testApp } from './helpers.js';

const t = testApp();
afterAll(() => t.app.close());

async function disburse(overrides: Partial<typeof exampleLoan> = {}) {
  const res = await t.post('/api/loans', { ...exampleLoan, ...overrides }, t.key());
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { loan: { id: number }; journalEntry: { id: number; lines: unknown[] } };
}

const pay = (id: number, amount: string, paymentDate: string, key = t.key()) =>
  t.post(`/api/loans/${id}/payments`, { amount, paymentDate }, key);

const entryCount = () => Number((t.db.prepare('SELECT COUNT(*) AS n FROM journal_entries').get() as { n: bigint }).n);

describe('validation', () => {
  it('rejects bad input with field-level errors', async () => {
    const res = await t.post('/api/loans/quote', { principal: 1200.5, annualRatePct: '18.123456', termMonths: 0, startDate: '2026-02-30' });
    expect(res.statusCode).toBe(400);
    const fields = res.json().errors.map((e: { field: string }) => e.field).sort();
    expect(fields).toEqual(['annualRatePct', 'principal', 'startDate', 'termMonths']);
  });

  it('rejects a JSON number for money (contract is string kobo)', async () => {
    const res = await t.post('/api/loans/quote', { ...exampleLoan, principal: 120000000 });
    expect(res.statusCode).toBe(400);
    expect(res.json().errors[0].field).toBe('principal');
  });

  it('a decimal kobo string is a 400 on the field, not a crash', async () => {
    for (const principal of ['12.5', '1e6', '-100', '']) {
      const res = await t.post('/api/loans/quote', { ...exampleLoan, principal });
      expect(res.statusCode, principal).toBe(400);
      expect(res.json().errors[0].field).toBe('principal');
    }
    const pay = await t.post('/api/loans/1/payments/preview', { amount: '100.5', paymentDate: '2026-02-15' });
    expect(pay.statusCode).toBe(400);
    expect(pay.json().errors[0].field).toBe('amount');
  });

  it('requires an Idempotency-Key on disbursement', async () => {
    const res = await t.post('/api/loans', exampleLoan);
    expect(res.statusCode).toBe(400);
  });
});

describe('origination', () => {
  it('posts Dr Loans Receivable / Cr Cash for the principal', async () => {
    const { journalEntry } = await disburse();
    expect(journalEntry.lines).toEqual([
      { account: 'LOANS_RECEIVABLE', debit: '120000000', credit: '0' },
      { account: 'CASH', debit: '0', credit: '120000000' },
    ]);
  });

  it('double-click (same key) disburses once and replays the same response', async () => {
    const before = entryCount();
    const key = t.key();
    const [a, b] = await Promise.all([t.post('/api/loans', exampleLoan, key), t.post('/api/loans', exampleLoan, key)]);
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(b.json()).toEqual(a.json());
    expect(entryCount()).toBe(before + 1);
  });

  it('rejects reusing a key with a different body', async () => {
    const key = t.key();
    await t.post('/api/loans', exampleLoan, key);
    const res = await t.post('/api/loans', { ...exampleLoan, principal: '999900' }, key);
    expect(res.statusCode).toBe(422);
  });

  it('failed requests do not burn the key', async () => {
    const key = t.key();
    const bad = await t.post('/api/loans', { ...exampleLoan, borrowerName: '' }, key);
    expect(bad.statusCode).toBe(400);
    expect(bad.json().errors[0].field).toBe('borrowerName');
    // Same key, different (now valid) body → allowed because nothing was stored.
    const good = await t.post('/api/loans', exampleLoan, key);
    expect(good.statusCode).toBe(201);
  });
});

describe('repayments', () => {
  it('preview and post use the same allocation; schedule + statement reflect server state', async () => {
    const { loan } = await disburse();
    const preview = await t.post(`/api/loans/${loan.id}/payments/preview`, { amount: '2000000', paymentDate: '2026-02-15' });
    expect(preview.json().allocation.totals).toEqual({ penalty: '0', fee: '0', interest: '1800000', principal: '200000' });

    const posted = await pay(loan.id, '2000000', '2026-02-15');
    expect(posted.statusCode).toBe(201);
    expect(posted.json().allocation).toEqual(preview.json().allocation);
    expect(posted.json().journalEntry.lines).toEqual([
      { account: 'CASH', debit: '2000000', credit: '0' },
      { account: 'LOANS_RECEIVABLE', debit: '0', credit: '200000' },
      { account: 'INTEREST_INCOME', debit: '0', credit: '1800000' },
    ]);

    const view = (await t.get(`/api/loans/${loan.id}?asOf=2026-02-15`)).json();
    expect(view.outstandingPrincipal).toBe('119800000');
    expect(view.instalments[0].status).toBe('PARTIAL');

    const st = (await t.get(`/api/loans/${loan.id}/statement`)).json();
    expect(st.closingBalance).toBe('119800000');
    expect(st.tiesOut).toBe(true);
  });

  it('overpayment: surplus is unapplied credit, not prepaid principal', async () => {
    const { loan } = await disburse();
    const res = await pay(loan.id, '25000000', '2026-02-20');
    const lines = res.json().journalEntry.lines;
    expect(lines).toContainEqual({ account: 'UNAPPLIED_CREDIT', debit: '0', credit: '3936974' });
    const view = (await t.get(`/api/loans/${loan.id}`)).json();
    expect(view.unappliedCredit).toBe('3936974');
    expect(view.outstandingPrincipal).toBe('100736974');
  });

  it('payment before anything is due is held entirely as credit', async () => {
    const { loan } = await disburse();
    const res = await pay(loan.id, '500000', '2026-01-20');
    expect(res.json().journalEntry.lines).toEqual([
      { account: 'CASH', debit: '500000', credit: '0' },
      { account: 'UNAPPLIED_CREDIT', debit: '0', credit: '500000' },
    ]);
  });

  it('same payment key twice posts once', async () => {
    const { loan } = await disburse();
    const before = entryCount();
    const key = t.key();
    await pay(loan.id, '21063026', '2026-02-15', key);
    const replay = await pay(loan.id, '21063026', '2026-02-15', key);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(entryCount()).toBe(before + 1);
  });

  it('paying the whole schedule on time closes the loan; it then refuses payments', async () => {
    const { loan } = await disburse();
    const sched = (await t.get(`/api/loans/${loan.id}`)).json().schedule.rows as { payment: string; dueDate: string }[];
    for (const r of sched) expect((await pay(loan.id, r.payment, r.dueDate)).statusCode).toBe(201);
    const view = (await t.get(`/api/loans/${loan.id}`)).json();
    expect(view.status).toBe('CLOSED');
    expect(view.outstandingPrincipal).toBe('0');
    expect(view.unappliedCredit).toBe('0');
    const st = (await t.get(`/api/loans/${loan.id}/statement`)).json();
    expect(st.closingBalance).toBe('0');
    expect(st.totals.interestCollected).toBe('6378154');
    expect((await pay(loan.id, '100', '2026-08-01')).statusCode).toBe(409);
  });

  it('rejects a payment dated before disbursement, against the paymentDate field', async () => {
    const { loan } = await disburse();
    const res = await t.post(`/api/loans/${loan.id}/payments/preview`, { amount: '100', paymentDate: '2025-12-31' });
    expect(res.statusCode).toBe(400);
    expect(res.json().errors).toEqual([{ field: 'paymentDate', message: 'Payment date cannot be before the disbursement date' }]);
  });
});

describe('payment history', () => {
  it('lists a loan’s payments newest first with what each one applied', async () => {
    const { loan } = await disburse();
    await pay(loan.id, '2000000', '2026-02-15');
    await pay(loan.id, '25000000', '2026-02-20');
    const res = await t.get(`/api/loans/${loan.id}/payments`);
    expect(res.statusCode).toBe(200);
    const [latest, first] = res.json();
    expect(first).toMatchObject({ kind: 'PAYMENT', amount: '2000000', applied: { interest: '1800000', principal: '200000' }, unappliedCredit: '0' });
    expect(latest).toMatchObject({ amount: '25000000', applied: { principal: '19063026' }, unappliedCredit: '5936974' });
  });

  it('lists payments across all loans, and 404s for an unknown loan', async () => {
    expect(Array.isArray((await t.get('/api/payments')).json())).toBe(true);
    expect((await t.get('/api/loans/99999/payments')).statusCode).toBe(404);
  });
});

describe('early payoff', () => {
  it('after two instalments: collects remaining principal, waives future interest, closes, ties out', async () => {
    const { loan } = await disburse();
    await pay(loan.id, '21063026', '2026-02-15');
    await pay(loan.id, '21063026', '2026-03-15');
    const preview = (await t.post(`/api/loans/${loan.id}/payoff/preview`, { paymentDate: '2026-04-01' })).json();
    expect(preview.quote.total).toBe('81185003');
    const res = await t.post(`/api/loans/${loan.id}/payoff`, { paymentDate: '2026-04-01' }, t.key());
    expect(res.statusCode).toBe(201);
    expect(res.json().journalEntry.lines).toEqual([
      { account: 'CASH', debit: '81185003', credit: '0' },
      { account: 'LOANS_RECEIVABLE', debit: '0', credit: '81185003' },
    ]);
    const view = (await t.get(`/api/loans/${loan.id}`)).json();
    expect(view.status).toBe('CLOSED');
    expect(view.instalments.slice(2).every((i: { status: string }) => i.status === 'WAIVED')).toBe(true);
    const st = (await t.get(`/api/loans/${loan.id}/statement`)).json();
    expect(st.closingBalance).toBe('0');
    expect(st.tiesOut).toBe(true);
  });

  it('with an overdue instalment: payoff includes its interest', async () => {
    const { loan } = await disburse();
    const res = await t.post(`/api/loans/${loan.id}/payoff`, { paymentDate: '2026-02-20' }, t.key());
    expect(res.json().journalEntry.lines).toContainEqual({ account: 'INTEREST_INCOME', debit: '0', credit: '1800000' });
  });
});

describe('ledger integrity', () => {
  it('every entry balances and the trial balance is level', async () => {
    const tb = (await t.get('/api/ledger/trial-balance')).json();
    expect(tb.balanced).toBe(true);
    const rows = t.db
      .prepare('SELECT entry_id, SUM(debit) AS d, SUM(credit) AS c, COUNT(*) AS n FROM journal_lines GROUP BY entry_id')
      .all() as { d: bigint; c: bigint; n: bigint }[];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.d).toBe(r.c);
      expect(r.n >= 2n).toBe(true);
    }
  });

  it('journal rows cannot be updated or deleted', () => {
    expect(() => t.db.prepare('UPDATE journal_lines SET debit = debit + 1').run()).toThrow(/immutable/);
    expect(() => t.db.prepare('DELETE FROM journal_entries').run()).toThrow(/immutable/);
  });
});
