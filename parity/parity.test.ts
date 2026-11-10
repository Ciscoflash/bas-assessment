/**
 * Browser ⇔ server parity. The frontend and backend each have their own copy of the
 * money code (frontend/src/money for previews, backend/src/money authoritative).
 * This is the only place both meet: it runs the frontend's preview locally and the
 * real backend API (in-process), decodes the API's JSON with the frontend's own
 * decoders, and requires the two to be identical to the kobo.
 */
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../backend/src/app.js';
import { buildSchedule, invoiceQuoteWire, quoteInvoice, scheduleWire, addDays } from '../frontend/src/money/index.js';

const { app } = buildApp();
afterAll(() => app.close());
const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload });

/** Rate in 1/10,000ths of a percent → "18.25"-style string. */
const rateString = (t: number) => {
  const frac = String(t % 10_000).padStart(4, '0').replace(/0+$/, '');
  return frac ? `${Math.floor(t / 10_000)}.${frac}` : String(Math.floor(t / 10_000));
};

describe('term loan: frontend preview = backend schedule', () => {
  it('Worked Example 1 matches to the kobo on both sides', async () => {
    const input = { principal: 120_000_000n, annualRatePct: '18', termMonths: 6, startDate: '2026-01-15' };
    const browser = buildSchedule(input);
    const server = scheduleWire.parse((await post('/api/loans/quote', { ...input, principal: '120000000' })).json());
    expect(server).toEqual(browser);
    expect(server.instalment).toBe(21_063_026n);
    expect(server.totalInterest).toBe(6_378_154n);
    expect(server.rows.at(-1)!.payment).toBe(21_063_024n);
  });

  it('agrees on 250 generated loans plus the range boundaries', async () => {
    const cases = fc.sample(
      fc.record({
        principal: fc.bigInt({ min: 100_000n, max: 500_000_000_000n }), // ₦1,000 – ₦5,000,000,000
        rate: fc.integer({ min: 5_000, max: 600_000 }), // 0.5% – 60%, up to 4 dp
        termMonths: fc.integer({ min: 1, max: 60 }),
      }),
      { numRuns: 250, seed: 42 },
    );
    cases.push(
      { principal: 100_000n, rate: 5_000, termMonths: 1 },
      { principal: 500_000_000_000n, rate: 600_000, termMonths: 60 },
      { principal: 500_000_000_000n, rate: 5_000, termMonths: 60 },
      { principal: 100_000n, rate: 600_000, termMonths: 60 },
    );
    for (const c of cases) {
      const input = { principal: c.principal, annualRatePct: rateString(c.rate), termMonths: c.termMonths, startDate: '2026-01-31' };
      const res = await post('/api/loans/quote', { ...input, principal: c.principal.toString() });
      expect(res.statusCode, res.body).toBe(200);
      expect(scheduleWire.parse(res.json())).toEqual(buildSchedule(input));
    }
  });
});

describe('invoice: frontend preview = backend quote', () => {
  it('agrees on 200 generated invoices (face value and tenor)', async () => {
    const cases = fc.sample(
      fc.record({ faceValue: fc.bigInt({ min: 1n, max: 500_000_000_000n }), tenor: fc.integer({ min: 1, max: 365 }) }),
      { numRuns: 200, seed: 7 },
    );
    cases.push({ faceValue: 100_000_000n, tenor: 60 }); // the brief's visible example
    for (const c of cases) {
      const input = { faceValue: c.faceValue, fundingDate: '2026-01-01', dueDate: addDays('2026-01-01', c.tenor) };
      const res = await post('/api/invoices/quote', { ...input, faceValue: c.faceValue.toString() });
      expect(res.statusCode, res.body).toBe(200);
      expect(invoiceQuoteWire.parse(res.json())).toEqual(quoteInvoice(input));
    }
  });
});
