import { Link, useSearchParams } from 'react-router-dom';
import { PaymentHistory } from '../components/PaymentHistory';
import { Card, Money, Stat } from '../components/ui';
import { useLoan, useLoans, usePayments } from '../lib/queries';
import { formatNaira } from '../money';
import { RepaymentPanel } from './LoanDetail';

/** Repayment desk: pick an active loan, take a payment, see every payment posted. */
export function RepaymentsPage() {
  const [params, setParams] = useSearchParams();
  const loans = useLoans();
  const payments = usePayments();
  const active = loans.data?.filter((l) => l.status === 'ACTIVE') ?? [];
  const selectedId = Number(params.get('loan')) || undefined;
  const selected = active.find((l) => l.id === selectedId);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_540px]">
        <Card title="Choose a loan">
          {loans.isLoading ? (
            <p className="text-sm text-muted">Loading loans…</p>
          ) : active.length === 0 ? (
            <p className="text-sm text-muted">
              No active loans to repay. <Link to="/loans/new" className="text-brand underline">Originate a loan</Link> first.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="loan-select" className="text-xs font-medium text-muted">Active loan</label>
                <select
                  id="loan-select"
                  className="min-h-[40px] rounded-md border border-line bg-surface px-3 text-sm"
                  value={selected?.id ?? ''}
                  onChange={(e) => setParams(e.target.value ? { loan: e.target.value } : {})}
                >
                  <option value="">Select a loan…</option>
                  {active.map((l) => (
                    <option key={l.id} value={l.id}>
                      #{l.id} · {l.borrowerName} · outstanding {formatNaira(l.outstandingPrincipal)}
                    </option>
                  ))}
                </select>
              </div>
              {selected && <LoanSnapshot id={selected.id} />}
            </div>
          )}
        </Card>
        {selected ? (
          <RepaymentPanel key={selected.id} loanId={selected.id} />
        ) : (
          <Card title="Take a repayment">
            <p className="text-sm text-muted">Select a loan to enter a payment. You'll see the server's allocation before anything is posted.</p>
          </Card>
        )}
      </div>

      <Card title="Recent payments (all loans)">
        {payments.isLoading ? <p className="text-sm text-muted">Loading…</p> : <PaymentHistory payments={payments.data ?? []} showLoan />}
      </Card>
    </div>
  );
}

/** What's owed on the selected loan right now, from the server. */
function LoanSnapshot({ id }: { id: number }) {
  const loan = useLoan(id);
  if (!loan.data) return null;
  const l = loan.data;
  const due = l.instalments.filter((i) => i.status === 'OVERDUE' || i.status === 'DUE' || i.status === 'PARTIAL');
  const dueNow = due.reduce((a, i) => a + i.outstanding, 0n);
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-canvas p-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Instalment"><Money value={l.instalmentAmount} /></Stat>
        <Stat label="Due now"><Money value={dueNow} className={dueNow > 0n ? 'text-bad' : ''} /></Stat>
        <Stat label="Outstanding principal"><Money value={l.outstandingPrincipal} /></Stat>
        <Stat label="Unapplied credit"><Money value={l.unappliedCredit} /></Stat>
      </div>
      <p className="text-xs text-muted">
        {due.length ? `${due.length} instalment${due.length > 1 ? 's' : ''} due or overdue. ` : 'Nothing is due yet; a payment now would be held as unapplied credit. '}
        <Link to={`/loans/${id}`} className="text-brand underline">Open full loan →</Link>
      </p>
    </div>
  );
}
