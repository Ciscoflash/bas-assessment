import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Card, Money, Table, Td, Th } from '../components/ui';
import { prettyDate } from '../lib/dates';
import { useLoans } from '../lib/queries';

export function LoansPage() {
  const q = useLoans();
  return (
    <Card
      title="Term loans"
      actions={
        <Link to="/loans/new" className="inline-flex min-h-[36px] items-center gap-1 rounded-md bg-brand px-3 text-sm font-medium text-brand-ink">
          <Plus className="h-4 w-4" aria-hidden /> New loan
        </Link>
      }
    >
      {q.isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !q.data?.length ? (
        <p className="text-sm text-muted">
          No loans yet. <Link to="/loans/new" className="text-brand underline">Originate the first one</Link>.
        </p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Borrower</Th>
              <Th>Disbursed</Th>
              <Th right>Principal</Th>
              <Th right>Rate · term</Th>
              <Th right>Outstanding</Th>
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {q.data.map((l) => (
              <tr key={l.id}>
                <Td className="num">{l.id}</Td>
                <Td><Link className="font-medium text-brand underline" to={`/loans/${l.id}`}>{l.borrowerName}</Link></Td>
                <Td>{prettyDate(l.startDate)}</Td>
                <Td right><Money value={l.principal} /></Td>
                <Td right className="num">{l.annualRatePct}% · {l.termMonths} mo</Td>
                <Td right><Money value={l.outstandingPrincipal} /></Td>
                <Td><Badge tone={l.status === 'ACTIVE' ? 'good' : 'neutral'}>{l.status}</Badge></Td>
                <Td right>
                  {l.status === 'ACTIVE' && (
                    <Link to={`/repayments?loan=${l.id}`} className="inline-flex min-h-[32px] items-center rounded-md border border-line px-3 text-xs font-medium hover:bg-canvas">
                      Repay
                    </Link>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
