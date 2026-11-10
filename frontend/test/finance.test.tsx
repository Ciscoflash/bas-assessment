import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettlementSummary, TieOut } from '../src/components/finance';

const base = { advance: 80_000_000n, reserve: 20_000_000n, discountFee: 4_734_247n, cashReceived: 100_000_000n };

describe('SettlementSummary', () => {
  it('shortfall: payable is ₦0.00 and the amount owed is called out', () => {
    render(<SettlementSummary s={{ ...base, daysOverdue: 96, penalty: 15_360_000n, totalCharges: 20_094_247n, clientReceives: 0n, clientOwes: 94_247n }} />);
    expect(screen.getByTestId('payable-to-client')).toHaveTextContent('₦0.00');
    expect(screen.getByTestId('shortfall')).toHaveTextContent('client owes ₦942.47');
  });

  it('never renders a negative payable, even if handed a negative number', () => {
    render(<SettlementSummary s={{ ...base, daysOverdue: 96, penalty: 15_360_000n, totalCharges: 20_094_247n, clientReceives: -94_247n, clientOwes: 94_247n }} />);
    expect(screen.getByTestId('payable-to-client')).toHaveTextContent('₦0.00');
    expect(screen.getByTestId('payable-to-client').textContent).not.toMatch(/[−-]/);
  });

  it('surplus: shows the payable and no shortfall', () => {
    render(<SettlementSummary s={{ ...base, daysOverdue: 95, penalty: 15_200_000n, totalCharges: 19_934_247n, clientReceives: 65_753n, clientOwes: 0n }} />);
    expect(screen.getByTestId('payable-to-client')).toHaveTextContent('₦657.53');
    expect(screen.queryByTestId('shortfall')).toBeNull();
  });
});

describe('TieOut', () => {
  it('green when ledger equals schedule', () => {
    render(<TieOut statementBalance={100_736_974n} scheduleOutstanding={100_736_974n} />);
    expect(screen.getByTestId('tie-out')).toHaveAttribute('data-state', 'ok');
  });

  it('red with the difference when they disagree', () => {
    render(<TieOut statementBalance={100_736_974n} scheduleOutstanding={100_736_970n} />);
    const el = screen.getByTestId('tie-out');
    expect(el).toHaveAttribute('data-state', 'mismatch');
    expect(el).toHaveClass('text-bad');
    expect(el).toHaveTextContent('difference ₦0.04');
  });
});
