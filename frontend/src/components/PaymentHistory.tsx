import { Link } from 'react-router-dom';
import type { PaymentView } from '../money';
import { prettyDate } from '../lib/dates';
import { Badge, Money, Table, Td, Th } from './ui';

/** Posted payments with how each was applied. `showLoan` adds a borrower column (for the all-loans view). */
export function PaymentHistory({ payments, showLoan = false }: { payments: PaymentView[]; showLoan?: boolean }) {
  if (payments.length === 0) return <p className="text-sm text-muted">No payments yet.</p>;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Date</Th>
          {showLoan && <Th>Loan</Th>}
          <Th>Type</Th>
          <Th right>Received</Th>
          <Th right>Penalty + fee</Th>
          <Th right>Interest</Th>
          <Th right>Principal</Th>
          <Th right>Unapplied</Th>
          <Th right>Journal</Th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p) => (
          <tr key={p.id}>
            <Td>{prettyDate(p.paymentDate)}</Td>
            {showLoan && (
              <Td>
                <Link className="font-medium text-brand underline" to={`/loans/${p.loanId}`}>
                  #{p.loanId} {p.borrowerName}
                </Link>
              </Td>
            )}
            <Td>
              <Badge tone={p.kind === 'PAYOFF' ? 'good' : 'neutral'}>{p.kind === 'PAYOFF' ? 'Payoff' : 'Repayment'}</Badge>
            </Td>
            <Td right className="font-semibold"><Money value={p.amount} /></Td>
            <Td right>{p.applied.penalty + p.applied.fee ? <Money value={p.applied.penalty + p.applied.fee} /> : '—'}</Td>
            <Td right>{p.applied.interest ? <Money value={p.applied.interest} /> : '—'}</Td>
            <Td right>{p.applied.principal ? <Money value={p.applied.principal} /> : '—'}</Td>
            <Td right>{p.unappliedCredit ? <Money value={p.unappliedCredit} className="text-warn" /> : '—'}</Td>
            <Td right className="num text-muted">#{p.journalEntryId}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
