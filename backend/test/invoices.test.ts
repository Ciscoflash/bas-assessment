import { afterAll, describe, expect, it } from 'vitest';
import { testApp } from './helpers.js';

const t = testApp();
afterAll(() => t.app.close());

const invoice = { clientName: 'Acme Ltd', debtorName: 'Big Retail Plc', faceValue: '100000000', fundingDate: '2026-01-01', dueDate: '2026-03-02' };

async function advance() {
  const res = await t.post('/api/invoices', invoice, t.key());
  expect(res.statusCode, res.body).toBe(201);
  return res.json();
}

describe('invoice financing', () => {
  it('quote matches the brief', async () => {
    const res = await t.post('/api/invoices/quote', invoice);
    expect(res.json()).toMatchObject({ advance: '80000000', reserve: '20000000', tenorDays: 60, discountFee: '4734247' });
  });

  it('due date must be after funding date, reported on dueDate', async () => {
    const res = await t.post('/api/invoices/quote', { ...invoice, dueDate: '2026-01-01' });
    expect(res.statusCode).toBe(400);
    expect(res.json().errors[0].field).toBe('dueDate');
  });

  it('advance posts Dr Invoice Receivables / Cr Cash', async () => {
    const { journalEntry } = await advance();
    expect(journalEntry.lines).toEqual([
      { account: 'INVOICE_RECEIVABLES', debit: '80000000', credit: '0' },
      { account: 'CASH', debit: '0', credit: '80000000' },
    ]);
  });

  it('shortfall at 96 days posts exactly the brief’s journal', async () => {
    const { invoice: inv } = await advance();
    const res = await t.post(`/api/invoices/${inv.id}/settlement`, { settlementDate: '2026-06-06' }, t.key()); // due + 96
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json();
    expect(body.settlement).toMatchObject({ daysOverdue: 96, penalty: '15360000', clientReceives: '0', clientOwes: '94247' });
    expect(body.journalEntry.lines).toEqual([
      { account: 'CASH', debit: '100000000', credit: '0' },
      { account: 'CLIENT_RECEIVABLE', debit: '94247', credit: '0' },
      { account: 'INVOICE_RECEIVABLES', debit: '0', credit: '80000000' },
      { account: 'FEE_INCOME', debit: '0', credit: '4734247' },
      { account: 'PENALTY_INCOME', debit: '0', credit: '15360000' },
    ]);
  });

  it('95 days: client receives 65,753 via Client Payable', async () => {
    const { invoice: inv } = await advance();
    const res = await t.post(`/api/invoices/${inv.id}/settlement/preview`, { settlementDate: '2026-06-05' });
    expect(res.json().settlement).toMatchObject({ daysOverdue: 95, clientReceives: '65753', clientOwes: '0' });
    expect(res.json().journalLines).toContainEqual({ account: 'CLIENT_PAYABLE', debit: '0', credit: '65753' });
  });

  it('cannot be settled twice', async () => {
    const { invoice: inv } = await advance();
    expect((await t.post(`/api/invoices/${inv.id}/settlement`, { settlementDate: '2026-03-02' }, t.key())).statusCode).toBe(201);
    expect((await t.post(`/api/invoices/${inv.id}/settlement`, { settlementDate: '2026-03-02' }, t.key())).statusCode).toBe(409);
  });

  it('trial balance stays level', async () => {
    expect((await t.get('/api/ledger/trial-balance')).json().balanced).toBe(true);
  });
});
