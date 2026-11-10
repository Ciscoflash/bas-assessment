import { buildApp } from '../src/app.js';

export function testApp() {
  const { app, db } = buildApp();
  let n = 0;
  const key = () => `test-key-${Date.now()}-${++n}`;
  const post = (url: string, payload: unknown, idemKey?: string) =>
    app.inject({ method: 'POST', url, payload: payload as object, headers: idemKey ? { 'idempotency-key': idemKey } : {} });
  const get = (url: string) => app.inject({ method: 'GET', url });
  return { app, db, key, post, get };
}

export const exampleLoan = {
  borrowerName: 'Ada Okafor',
  principal: '120000000',
  annualRatePct: '18',
  termMonths: 6,
  startDate: '2026-01-15',
};
