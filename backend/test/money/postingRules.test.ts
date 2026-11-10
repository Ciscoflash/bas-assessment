import { describe, expect, it } from 'vitest';
import {
  addDays,
  disbursementLines,
  invoiceSettlementLines,
  isBalanced,
  paymentLines,
  quoteInvoice,
  settleInvoice,
} from '../../src/money/index.js';

describe('posting rules', () => {
  it('disbursement for Worked Example 1', () => {
    expect(disbursementLines(120_000_000n)).toEqual([
      { account: 'LOANS_RECEIVABLE', debit: 120_000_000n, credit: 0n },
      { account: 'CASH', debit: 0n, credit: 120_000_000n },
    ]);
  });

  it('payment drops zero lines and balances', () => {
    const lines = paymentLines(25_000_000n, { penalty: 0n, fee: 0n, interest: 1_800_000n, principal: 19_263_026n }, 3_936_974n);
    expect(lines.map((l) => l.account)).toEqual(['CASH', 'LOANS_RECEIVABLE', 'INTEREST_INCOME', 'UNAPPLIED_CREDIT']);
    expect(isBalanced(lines)).toBe(true);
  });

  it('shortfall settlement at 96 days matches the brief exactly', () => {
    const q = quoteInvoice({ faceValue: 100_000_000n, fundingDate: '2026-01-01', dueDate: '2026-03-02' });
    const lines = invoiceSettlementLines(settleInvoice(q, addDays(q.dueDate, 96)));
    expect(lines).toEqual([
      { account: 'CASH', debit: 100_000_000n, credit: 0n },
      { account: 'CLIENT_RECEIVABLE', debit: 94_247n, credit: 0n },
      { account: 'INVOICE_RECEIVABLES', debit: 0n, credit: 80_000_000n },
      { account: 'FEE_INCOME', debit: 0n, credit: 4_734_247n },
      { account: 'PENALTY_INCOME', debit: 0n, credit: 15_360_000n },
    ]);
    expect(isBalanced(lines)).toBe(true);
  });

  it('settlement with a surplus credits Client Payable and balances at every day', () => {
    const q = quoteInvoice({ faceValue: 100_000_000n, fundingDate: '2026-01-01', dueDate: '2026-03-02' });
    for (let d = 0; d < 200; d++) expect(isBalanced(invoiceSettlementLines(settleInvoice(q, addDays(q.dueDate, d))))).toBe(true);
    const lines = invoiceSettlementLines(settleInvoice(q, addDays(q.dueDate, 95)));
    expect(lines.find((l) => l.account === 'CLIENT_PAYABLE')?.credit).toBe(65_753n);
    expect(lines.find((l) => l.account === 'CLIENT_RECEIVABLE')).toBeUndefined();
  });
});
