import {
  allocationWire,
  journalEntryWire,
  journalLineWire,
  koboToWire,
  loanViewWire,
  nairaInputToKobo,
  payoffWire,
  paymentRequest,
  type JournalEntryView,
} from '../money';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { AllocationTable, JournalLines, ScheduleTable, TieOut } from '../components/finance';
import { Badge, Banner, Button, Card, Field, FormError, Money, Stat } from '../components/ui';
import { ApiError, api, newIdempotencyKey } from '../lib/api';
import { todayIso } from '../lib/dates';
import { validate } from '../lib/form';
import { useLoan, usePayments, useStatement } from '../lib/queries';
import { PaymentHistory } from '../components/PaymentHistory';
import { useDebounced } from '../lib/useDebounced';

const paymentPreviewWire = z.object({ allocation: allocationWire, journalLines: z.array(journalLineWire) });
const payoffPreviewWire = z.object({ quote: payoffWire, journalLines: z.array(journalLineWire) });
const postedWire = z.object({ journalEntry: journalEntryWire, loan: loanViewWire });

export function LoanDetailPage() {
  const id = Number(useParams().id);
  const loan = useLoan(id);
  const statement = useStatement(id);
  const payments = usePayments(id);

  if (loan.isLoading) return <p className="text-sm text-muted">Loading loan…</p>;
  if (loan.error || !loan.data) return <Banner tone="bad">{loan.error?.message ?? 'Loan not found'}</Banner>;
  const l = loan.data;
  const status = Object.fromEntries(l.instalments.map((i) => [i.number, { status: i.status, outstanding: i.outstanding }]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted">Term loan #{l.id}</p>
          <h1 className="text-xl font-semibold">{l.borrowerName}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={l.status === 'ACTIVE' ? 'good' : 'neutral'}>{l.status}</Badge>
          <Link to={`/loans/${id}/statement`} className="text-sm font-medium text-brand underline">
            Borrower statement →
          </Link>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Stat label="Principal"><Money value={l.principal} /></Stat>
          <Stat label="Rate · term"><span className="num">{l.annualRatePct}% · {l.termMonths} mo</span></Stat>
          <Stat label="Instalment"><Money value={l.instalmentAmount} /></Stat>
          <Stat label="Outstanding principal"><Money value={l.outstandingPrincipal} /></Stat>
          <Stat label="Unapplied credit"><Money value={l.unappliedCredit} className={l.unappliedCredit > 0n ? 'text-warn' : ''} /></Stat>
        </div>
        {statement.data && (
          <div className="mt-4">
            <TieOut statementBalance={statement.data.closingBalance} scheduleOutstanding={l.outstandingPrincipal} />
          </div>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_540px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Schedule">
            <ScheduleTable rows={l.schedule.rows} totalInterest={l.schedule.totalInterest} status={status} />
          </Card>
          <Card title="Payment history">
            {payments.data ? <PaymentHistory payments={payments.data} /> : <p className="text-sm text-muted">Loading…</p>}
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {l.status === 'ACTIVE' ? (
            <>
              <RepaymentPanel loanId={id} />
              <PayoffPanel loanId={id} />
            </>
          ) : (
            <Card title="Repayment">
              <p className="text-sm text-muted">
                This loan is closed: everything owed has been paid, so it can't take further payments. The payments are listed under Payment history.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function usePosted(loanId: number) {
  const qc = useQueryClient();
  // After a post, refetch everything from the server rather than patching client state.
  // Preview queries are left alone: they're recomputed when the officer next edits the form.
  const notPreview = (q: { queryKey: readonly unknown[] }) => !String(q.queryKey[2] ?? '').endsWith('preview');
  return () => qc.invalidateQueries({ queryKey: ['loans'], predicate: notPreview });
}

export function RepaymentPanel({ loanId }: { loanId: number }) {
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [posted, setPosted] = useState<JournalEntryView | null>(null);
  const key = useRef(newIdempotencyKey());
  const inFlight = useRef(false);
  const refresh = usePosted(loanId);

  const kobo = nairaInputToKobo(amount);
  const request = { amount: kobo === null ? amount : koboToWire(kobo), paymentDate };
  const checked = validate(paymentRequest, request);
  const debounced = useDebounced(checked.ok ? checked.data : null, 250);

  // New amount/date = a new payment intent = a new idempotency key.
  useEffect(() => {
    key.current = newIdempotencyKey();
  }, [amount, paymentDate]);

  const preview = useQuery({
    queryKey: ['loans', loanId, 'payment-preview', debounced],
    enabled: debounced !== null,
    queryFn: () => api('POST', `/loans/${loanId}/payments/preview`, { body: debounced, schema: paymentPreviewWire }),
    retry: false,
  });

  useEffect(() => {
    if (preview.error instanceof ApiError) setErrors(preview.error.byField());
  }, [preview.error]);

  const confirm = useMutation({
    mutationFn: (body: z.infer<typeof paymentRequest>) =>
      api('POST', `/loans/${loanId}/payments`, { body, idempotencyKey: key.current, schema: postedWire }),
    onSuccess: async (res) => {
      setPosted(res.journalEntry);
      setAmount('');
      await refresh();
    },
    onError: (e) => e instanceof ApiError && setErrors(e.byField()),
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    const v = validate(paymentRequest, request);
    if (!v.ok) return setErrors(v.errors);
    inFlight.current = true;
    confirm.mutate(v.data);
  };

  const previewMatchesInput = preview.data && debounced && checked.ok && debounced.amount === checked.data.amount && debounced.paymentDate === checked.data.paymentDate;

  return (
    <Card title="Take a repayment">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Amount received"
            name="amount"
            prefix="₦"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setErrors({});
              setPosted(null);
            }}
            error={errors.amount}
          />
          <Field
            label="Payment date"
            name="paymentDate"
            type="date"
            value={paymentDate}
            onChange={(e) => {
              setPaymentDate(e.target.value);
              setErrors({});
            }}
            error={errors.paymentDate}
          />
        </div>
        {preview.isFetching && <p className="text-xs text-muted">Calculating allocation on the server…</p>}
        {preview.error && !(preview.error instanceof ApiError && preview.error.fieldErrors.length) && <FormError message={preview.error.message} />}
        {previewMatchesInput && preview.data && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-muted">Server allocation preview (oldest due first · penalty → fee → interest → principal)</p>
            <AllocationTable lines={preview.data.allocation.lines} totals={preview.data.allocation.totals} unapplied={preview.data.allocation.unappliedCredit} />
            <JournalLines lines={preview.data.journalLines} caption="Entry that will be posted" />
          </div>
        )}
        {confirm.error && !(confirm.error instanceof ApiError && confirm.error.fieldErrors.length) && <FormError message={confirm.error.message} />}
        <Button type="submit" loading={confirm.isPending} disabled={!previewMatchesInput}>
          Confirm and post payment
        </Button>
        {posted && (
          <Banner tone="good">
            Posted journal #{posted.id}. Schedule and statement now show the server's figures.
          </Banner>
        )}
      </form>
    </Card>
  );
}

function PayoffPanel({ loanId }: { loanId: number }) {
  const [open, setOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [error, setError] = useState<string>();
  const key = useRef(newIdempotencyKey());
  const inFlight = useRef(false);
  const refresh = usePosted(loanId);

  useEffect(() => {
    key.current = newIdempotencyKey();
  }, [paymentDate]);

  const preview = useQuery({
    queryKey: ['loans', loanId, 'payoff-preview', paymentDate],
    enabled: open && /^\d{4}-\d{2}-\d{2}$/.test(paymentDate),
    queryFn: () => api('POST', `/loans/${loanId}/payoff/preview`, { body: { paymentDate }, schema: payoffPreviewWire }),
    retry: false,
  });

  const confirm = useMutation({
    mutationFn: () => api('POST', `/loans/${loanId}/payoff`, { body: { paymentDate }, idempotencyKey: key.current, schema: postedWire }),
    onSuccess: () => refresh(),
    onError: (e) => setError(e instanceof ApiError ? (e.byField().paymentDate ?? e.message) : String(e)),
    onSettled: () => {
      inFlight.current = false;
    },
  });

  if (!open)
    return (
      <Card title="Early payoff">
        <p className="mb-3 text-sm text-muted">Settle the loan in full today. Interest on instalments not yet due is waived.</p>
        <Button variant="secondary" onClick={() => setOpen(true)}>Quote a payoff</Button>
      </Card>
    );

  const fieldErr = preview.error instanceof ApiError ? preview.error.byField().paymentDate : undefined;
  return (
    <Card title="Early payoff">
      <div className="flex flex-col gap-4">
        <Field label="Payoff date" name="payoffDate" type="date" value={paymentDate} onChange={(e) => { setPaymentDate(e.target.value); setError(undefined); }} error={fieldErr ?? error} />
        {preview.error && !fieldErr && <FormError message={preview.error.message} />}
        {preview.data && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Payoff amount"><Money value={preview.data.quote.total} /></Stat>
              <Stat label="Interest waived"><Money value={preview.data.quote.interestWaived} /></Stat>
            </div>
            <JournalLines lines={preview.data.journalLines} caption="Entry that will be posted" />
            <Button
              loading={confirm.isPending}
              onClick={() => {
                if (inFlight.current) return;
                inFlight.current = true;
                confirm.mutate();
              }}
            >
              Collect <Money value={preview.data.quote.total} /> and close loan
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
