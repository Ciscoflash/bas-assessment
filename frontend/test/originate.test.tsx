import { buildSchedule, toWire } from '../src/money';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OriginatePage } from '../src/pages/Originate';
import { mockFetch, renderWithProviders } from './render';

afterEach(() => vi.unstubAllGlobals());

const schedule = buildSchedule({ principal: 120_000_000n, annualRatePct: '18', termMonths: 6, startDate: '2026-01-15' });

async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Borrower name'), 'Ada Okafor');
  await user.type(screen.getByLabelText('Principal'), '1,200,000');
  await user.type(screen.getByLabelText('Annual rate'), '18');
  await user.type(screen.getByLabelText('Term'), '6');
  const date = screen.getByLabelText('Disbursement date');
  await user.clear(date);
  await user.type(date, '2026-01-15');
}

describe('Originate', () => {
  it('sends kobo as a string and shows the server schedule with a parity check', async () => {
    const calls = mockFetch({ 'POST /api/loans/quote': () => ({ status: 200, json: toWire(schedule) }) });
    const user = userEvent.setup();
    renderWithProviders(<OriginatePage />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Get quote' }));
    expect(await screen.findByText('Matches browser preview to the kobo')).toBeInTheDocument();
    expect(calls[0]!.body).toMatchObject({ principal: '120000000', annualRatePct: '18', termMonths: 6 });
    expect(screen.getAllByText('₦210,630.26').length).toBeGreaterThan(0);
  });

  it('shows server validation errors against the right field', async () => {
    mockFetch({
      'POST /api/loans/quote': () => ({ status: 400, json: { error: 'Validation failed', errors: [{ field: 'annualRatePct', message: 'Rate rejected by server' }] } }),
    });
    const user = userEvent.setup();
    renderWithProviders(<OriginatePage />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Get quote' }));
    const rate = screen.getByLabelText('Annual rate');
    await waitFor(() => expect(rate).toHaveAttribute('aria-invalid', 'true'));
    expect(document.getElementById(rate.getAttribute('aria-describedby')!)).toHaveTextContent('Rate rejected by server');
    expect(screen.getByLabelText('Principal')).not.toHaveAttribute('aria-invalid');
  });

  it('validates on the client with the shared schema before calling the server', async () => {
    const calls = mockFetch({});
    const user = userEvent.setup();
    renderWithProviders(<OriginatePage />);
    await user.type(screen.getByLabelText('Principal'), '12.345');
    await user.click(screen.getByRole('button', { name: 'Get quote' }));
    expect(screen.getByLabelText('Principal')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Borrower name')).toHaveAttribute('aria-invalid', 'true');
    expect(calls).toHaveLength(0);
  });

  it('double-clicking Approve sends one disbursement request', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const calls = mockFetch({
      'POST /api/loans/quote': () => ({ status: 200, json: toWire(schedule) }),
      'POST /api/loans': async () => {
        await gate; // hold the request open while the user keeps clicking
        return {
          status: 201,
          json: toWire({
            loan: {
              id: 1, borrowerName: 'Ada Okafor', principal: 120_000_000n, annualRatePct: '18', termMonths: 6, startDate: '2026-01-15', status: 'ACTIVE',
              instalmentAmount: schedule.instalment, outstandingPrincipal: 120_000_000n, unappliedCredit: 0n, instalments: [], schedule,
            },
            journalEntry: { id: 7, eventType: 'DISBURSEMENT', effectiveDate: '2026-01-15', memo: '', reversesId: null, lines: [
              { account: 'LOANS_RECEIVABLE', debit: 120_000_000n, credit: 0n },
              { account: 'CASH', debit: 0n, credit: 120_000_000n },
            ] },
          }),
        };
      },
    });
    const user = userEvent.setup();
    renderWithProviders(<OriginatePage />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Get quote' }));
    const approve = await screen.findByRole('button', { name: 'Approve and disburse' });
    await user.dblClick(approve);
    await user.click(approve);
    release();
    expect(await screen.findByText('Disbursement posted · journal #7')).toBeInTheDocument();
    const posts = calls.filter((c) => c.key === 'POST /api/loans');
    expect(posts).toHaveLength(1);
    expect(posts[0]!.headers['idempotency-key']).toBeTruthy();
  });
});
