import { useParams, Link } from 'react-router-dom';
import { TieOut } from '../components/finance';
import { Banner, Card, Money, Stat, Table, Td, Th } from '../components/ui';
import { prettyDate } from '../lib/dates';
import { useLoan, useStatement } from '../lib/queries';

const EVENT_LABEL: Record<string, string> = { DISBURSEMENT: 'Disbursement', PAYMENT: 'Repayment', PAYOFF: 'Early payoff', REVERSAL: 'Reversal' };

export function StatementPage() {
  const id = Number(useParams().id);
  const st = useStatement(id);
  const loan = useLoan(id);
  if (st.isLoading || loan.isLoading) return <p className="text-sm text-muted">Loading statement…</p>;
  if (st.error || !st.data) return <Banner tone="bad">{st.error?.message ?? 'Not found'}</Banner>;
  const s = st.data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted">
            <Link to={`/loans/${id}`} className="underline">Loan #{id}</Link> · Borrower statement
          </p>
          <h1 className="text-xl font-semibold">{s.borrowerName}</h1>
        </div>
        {/* Statement closing balance (ledger) vs schedule's outstanding principal (loan endpoint) */}
        {loan.data && <TieOut statementBalance={s.closingBalance} scheduleOutstanding={loan.data.outstandingPrincipal} />}
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Stat label="Principal balance (ledger)"><Money value={s.closingBalance} /></Stat>
          <Stat label="Interest paid"><Money value={s.totals.interestCollected} /></Stat>
          <Stat label="Penalties paid"><Money value={s.totals.penaltyCollected} /></Stat>
          <Stat label="Fees paid"><Money value={s.totals.feeCollected} /></Stat>
          <Stat label="Unapplied credit"><Money value={s.totals.unappliedCredit} /></Stat>
        </div>
      </Card>

      <Card title="Transactions" actions={<span className="text-xs text-muted">Built from this loan's ledger lines. Balance = Loans Receivable debits − credits.</span>}>
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Description</Th>
              <Th right>Cash</Th>
              <Th right>Interest</Th>
              <Th right>Penalty / fee</Th>
              <Th right>Unapplied</Th>
              <Th right>Principal Dr</Th>
              <Th right>Principal Cr</Th>
              <Th right>Balance</Th>
            </tr>
          </thead>
          <tbody>
            {s.lines.map((l) => (
              <tr key={l.entryId}>
                <Td>{prettyDate(l.date)}</Td>
                <Td>
                  <span className="font-medium">{EVENT_LABEL[l.eventType] ?? l.eventType}</span>
                  <span className="block max-w-[220px] truncate text-xs text-muted" title={l.memo}>
                    #{l.entryId} · {l.memo}
                  </span>
                </Td>
                <Td right><Money value={l.cash < 0n ? -l.cash : l.cash} className={l.cash < 0n ? 'text-muted' : ''} />{l.cash < 0n && <span className="block text-[11px] text-muted">paid out</span>}</Td>
                <Td right>{l.interest ? <Money value={l.interest} /> : '—'}</Td>
                <Td right>{l.penalty + l.fee ? <Money value={l.penalty + l.fee} /> : '—'}</Td>
                <Td right>{l.unapplied ? <Money value={l.unapplied} /> : '—'}</Td>
                <Td right>{l.debit ? <Money value={l.debit} /> : '—'}</Td>
                <Td right>{l.credit ? <Money value={l.credit} /> : '—'}</Td>
                <Td right className="font-semibold"><Money value={l.runningBalance} /></Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <Td>Closing balance</Td>
              <Td /><Td /><Td /><Td /><Td /><Td /><Td />
              <Td right><Money value={s.closingBalance} /></Td>
            </tr>
          </tfoot>
        </Table>
      </Card>
    </div>
  );
}
