import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/connection.js';
import { createTx } from '../src/db/transaction.js';
import { createLedgerRepository } from '../src/repositories/ledger.repository.js';
import { createLedgerService, normaliseLines } from '../src/services/ledger.service.js';

const cash = (debit: bigint, credit = 0n) => ({ account: 'CASH' as const, debit, credit });
const fee = (debit: bigint, credit = 0n) => ({ account: 'FEE_INCOME' as const, debit, credit });

describe('normaliseLines (double-entry rules)', () => {
  it('drops zero lines', () => {
    expect(normaliseLines([cash(500n), fee(0n, 500n), { account: 'PENALTY_INCOME', debit: 0n, credit: 0n }])).toHaveLength(2);
  });
  it('refuses unbalanced, single-line, negative and two-sided lines', () => {
    expect(() => normaliseLines([cash(100n), fee(0n, 99n)])).toThrow(/balance/);
    expect(() => normaliseLines([cash(0n), fee(0n)])).toThrow(/two/);
    expect(() => normaliseLines([cash(-1n), fee(0n, -1n)])).toThrow(/Negative/);
    expect(() => normaliseLines([cash(5n, 5n), fee(0n, 0n)])).toThrow(/both/);
  });
});

describe('ledger service', () => {
  const db = openDb();
  const ledger = createLedgerService({ ledgerRepo: createLedgerRepository(db), tx: createTx(db) });

  it('posts and reads back an entry', () => {
    const e = ledger.post({ eventType: 'TEST', effectiveDate: '2026-01-01', lines: [cash(500n), fee(0n, 500n)] });
    expect(ledger.getEntry(e.id)).toEqual(e);
  });

  it('reverses with a mirror entry and leaves the original untouched', () => {
    const e = ledger.post({ eventType: 'TEST', effectiveDate: '2026-01-01', lines: [cash(700n), fee(0n, 700n)] });
    const r = ledger.reverse(e.id, '2026-01-02');
    expect(r.reversesId).toBe(e.id);
    expect(r.lines).toEqual([cash(0n, 700n), fee(700n, 0n)]);
    expect(ledger.getEntry(e.id).lines).toEqual(e.lines);
    expect(() => ledger.reverse(e.id, '2026-01-03')).toThrow(/already/);
  });

  it('keeps the trial balance level', () => {
    expect(ledger.trialBalance().balanced).toBe(true);
  });

  it('the database itself rejects edits to the journal', () => {
    expect(() => db.prepare('UPDATE journal_lines SET debit = debit + 1').run()).toThrow(/immutable/);
    expect(() => db.prepare('DELETE FROM journal_entries').run()).toThrow(/immutable/);
  });
});
