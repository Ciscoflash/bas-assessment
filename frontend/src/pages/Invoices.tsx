import {
  addDays,
  createInvoiceRequest,
  invoiceQuoteRequest,
  invoiceQuoteWire,
  invoiceSettlementWire,
  invoiceViewWire,
  journalEntryWire,
  journalLineWire,
  koboToWire,
  nairaInputToKobo,
  quoteInvoice,
  type JournalEntryView,
} from '../money';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { JournalLines, SettlementSummary } from '../components/finance';
import { Badge, Banner, Button, Card, Field, FormError, Money, Stat, Table, Td, Th } from '../components/ui';
import { ApiError, api, newIdempotencyKey } from '../lib/api';
import { prettyDate, todayIso } from '../lib/dates';
import { validate } from '../lib/form';
import { useDebounced } from '../lib/useDebounced';

export function InvoicesPage() {
  const q = useQuery({ queryKey: ['invoices'], queryFn: () => api('GET', '/invoices', { schema: z.array(invoiceViewWire) }) });
  return (
    <Card
      title="Invoice financing"
      actions={
        <Link to="/invoices/new" className="inline-flex min-h-[36px] items-center gap-1 rounded-md bg-brand px-3 text-sm font-medium text-brand-ink">
          <Plus className="h-4 w-4" aria-hidden /> Finance an invoice
        </Link>
      }
    >
      {q.isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : !q.data?.length ? (
        <p className="text-sm text-muted">No invoices financed yet.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Client</Th>
              <Th>Due</Th>
              <Th right>Face value</Th>
              <Th right>Advance</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((i) => (
              <tr key={i.id}>
                <Td className="num">{i.id}</Td>
                <Td><Link className="font-medium text-brand underline" to={`/invoices/${i.id}`}>{i.clientName}</Link></Td>
                <Td>{prettyDate(i.dueDate)}</Td>
                <Td right><Money value={i.faceValue} /></Td>
                <Td right><Money value={i.advance} /></Td>
                <Td>
                  <Badge tone={i.status === 'ADVANCED' ? 'warn' : i.settlement?.clientOwes ? 'bad' : 'good'}>
                    {i.status === 'SETTLED' && i.settlement?.clientOwes ? 'Settled · shortfall' : i.status}
                  </Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

const createdWire = z.object({ invoice: invoiceViewWire, journalEntry: journalEntryWire });

export function InvoiceQuotePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const today = todayIso();
  const [form, setForm] = useState({ clientName: '', debtorName: '', faceValue: '', fundingDate: today, dueDate: addDays(today, 60) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const key = useRef(newIdempotencyKey());
  const inFlight = useRef(false);

  const kobo = nairaInputToKobo(form.faceValue);
  const request = { ...form, debtorName: form.debtorName || undefined, faceValue: kobo === null ? form.faceValue : koboToWire(kobo) };
  const checked = validate(createInvoiceRequest, request);
  const quoteInput = useMemo(() => {
    const v = validate(invoiceQuoteRequest, { faceValue: request.faceValue, fundingDate: request.fundingDate, dueDate: request.dueDate });
    return v.ok ? { faceValue: v.data.faceValue, fundingDate: v.data.fundingDate, dueDate: v.data.dueDate } : null;
  }, [request.faceValue, request.fundingDate, request.dueDate]);
  const debounced = useDebounced(quoteInput, 250);

  useEffect(() => {
    key.current = newIdempotencyKey();
  }, [form]);

  // Server quote is what we show; local quote is only a parity check.
  const serverQuote = useQuery({
    queryKey: ['invoice-quote', debounced],
    enabled: debounced !== null,
    queryFn: () => api('POST', '/invoices/quote', { body: debounced, schema: invoiceQuoteWire }),
    retry: false,
  });
  const localQuote = quoteInput ? quoteInvoice({ ...quoteInput, faceValue: BigInt(quoteInput.faceValue) }) : null;

  const create = useMutation({
    mutationFn: (body: z.infer<typeof createInvoiceRequest>) => api('POST', '/invoices', { body, idempotencyKey: key.current, schema: createdWire }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      navigate(`/invoices/${res.invoice.id}`, { state: { advanceEntryId: res.journalEntry.id } });
    },
    onError: (e) => e instanceof ApiError && setErrors(e.byField()),
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: '' }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    if (!checked.ok) return setErrors(checked.errors);
    inFlight.current = true;
    create.mutate(checked.data);
  };

  const q = serverQuote.data;
  const fresh = q && debounced && quoteInput && debounced.faceValue === quoteInput.faceValue && debounced.dueDate === quoteInput.dueDate && debounced.fundingDate === quoteInput.fundingDate;
  const parity = fresh && localQuote && q.discountFee === localQuote.discountFee && q.advance === localQuote.advance;

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card title="Finance an invoice">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Client (seller)" name="clientName" value={form.clientName} onChange={set('clientName')} error={errors.clientName} />
          <Field label="Debtor (pays at maturity)" name="debtorName" value={form.debtorName} onChange={set('debtorName')} error={errors.debtorName} />
          <Field label="Invoice face value" name="faceValue" prefix="₦" inputMode="decimal" placeholder="1,000,000" value={form.faceValue} onChange={set('faceValue')} error={errors.faceValue} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Funding date" name="fundingDate" type="date" value={form.fundingDate} onChange={set('fundingDate')} error={errors.fundingDate} />
            <Field label="Due date" name="dueDate" type="date" value={form.dueDate} onChange={set('dueDate')} error={errors.dueDate} />
          </div>
          {create.error && !(create.error instanceof ApiError && create.error.fieldErrors.length) && <FormError message={create.error.message} />}
          <Button type="submit" loading={create.isPending} disabled={!fresh}>
            Advance funds
          </Button>
        </form>
      </Card>

      <Card title="Quote" actions={fresh ? <span className={`text-xs ${parity ? 'text-good' : 'text-bad'}`}>{parity ? 'Server quote matches browser preview' : 'Server ≠ preview'}</span> : null}>
        {!fresh ? (
          <p className="text-sm text-muted">Enter a face value and dates to see the advance, reserve and discount fee.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Advance (80%)"><Money value={q.advance} kobo /></Stat>
              <Stat label="Reserve held back"><Money value={q.reserve} kobo /></Stat>
              <Stat label={`Discount fee (36% · ${q.tenorDays} days)`}><Money value={q.discountFee} kobo /></Stat>
              <Stat label="Client keeps if paid on time"><Money value={q.reserve - q.discountFee > 0n ? q.reserve - q.discountFee : 0n} kobo /></Stat>
            </div>
            <p className="text-xs text-muted">Late penalty: 0.2% of the advance per day overdue, starting the day after the due date. Charges come out of the reserve at settlement; any excess is owed by the client.</p>
            <JournalLines lines={[{ account: 'INVOICE_RECEIVABLES', debit: q.advance, credit: 0n }, { account: 'CASH', debit: 0n, credit: q.advance }]} caption="Entry on advance" />
          </div>
        )}
      </Card>
    </div>
  );
}

const settlementPreviewWire = z.object({ settlement: invoiceSettlementWire, journalLines: z.array(journalLineWire) });
const settledWire = z.object({ settlement: invoiceSettlementWire, journalEntry: journalEntryWire, invoice: invoiceViewWire });

export function InvoiceDetailPage() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const inv = useQuery({ queryKey: ['invoices', id], queryFn: () => api('GET', `/invoices/${id}`, { schema: invoiceViewWire }) });
  const [settlementDate, setSettlementDate] = useState('');
  const [error, setError] = useState<string>();
  const key = useRef(newIdempotencyKey());
  const inFlight = useRef(false);
  const [posted, setPosted] = useState<JournalEntryView | null>(null);

  useEffect(() => {
    if (inv.data && !settlementDate) setSettlementDate(inv.data.dueDate);
  }, [inv.data, settlementDate]);
  useEffect(() => {
    key.current = newIdempotencyKey();
    setError(undefined);
  }, [settlementDate]);

  const preview = useQuery({
    queryKey: ['invoices', id, 'settlement-preview', settlementDate],
    enabled: inv.data?.status === 'ADVANCED' && /^\d{4}-\d{2}-\d{2}$/.test(settlementDate),
    queryFn: () => api('POST', `/invoices/${id}/settlement/preview`, { body: { settlementDate }, schema: settlementPreviewWire }),
    retry: false,
  });

  const settle = useMutation({
    mutationFn: () => api('POST', `/invoices/${id}/settlement`, { body: { settlementDate }, idempotencyKey: key.current, schema: settledWire }),
    onSuccess: async (res) => {
      setPosted(res.journalEntry);
      // Refresh from server state, but don't re-run the (now stale) settlement preview.
      await qc.invalidateQueries({ queryKey: ['invoices'], predicate: (q) => q.queryKey[2] !== 'settlement-preview' });
    },
    onError: (e) => setError(e instanceof ApiError ? (e.byField().settlementDate ?? e.message) : String(e)),
    onSettled: () => {
      inFlight.current = false;
    },
  });

  if (inv.isLoading) return <p className="text-sm text-muted">Loading invoice…</p>;
  if (inv.error || !inv.data) return <Banner tone="bad">{inv.error?.message ?? 'Not found'}</Banner>;
  const i = inv.data;
  const previewFieldErr = preview.error instanceof ApiError ? preview.error.byField().settlementDate : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs text-muted">Invoice #{i.id}{i.debtorName && ` · debtor ${i.debtorName}`}</p>
        <h1 className="text-xl font-semibold">{i.clientName}</h1>
      </div>
      <Card>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Stat label="Face value"><Money value={i.faceValue} /></Stat>
          <Stat label="Advance"><Money value={i.advance} /></Stat>
          <Stat label="Reserve"><Money value={i.reserve} /></Stat>
          <Stat label="Discount fee"><Money value={i.discountFee} /></Stat>
          <Stat label="Due"><span>{prettyDate(i.dueDate)} <span className="text-xs text-muted">({i.tenorDays} days)</span></span></Stat>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {i.status === 'ADVANCED' ? (
          <Card title="Settlement">
            <div className="flex flex-col gap-4">
              <Field
                label="Date debtor paid (face value)"
                name="settlementDate"
                type="date"
                value={settlementDate}
                onChange={(e) => setSettlementDate(e.target.value)}
                error={previewFieldErr ?? error}
                hint="Overdue days start the day after the due date"
              />
              {preview.error && !previewFieldErr && <FormError message={preview.error.message} />}
              {preview.data && (
                <>
                  <SettlementSummary s={preview.data.settlement} />
                  <JournalLines lines={preview.data.journalLines} caption="Entry that will be posted" />
                  <Button
                    loading={settle.isPending}
                    onClick={() => {
                      if (inFlight.current) return;
                      inFlight.current = true;
                      settle.mutate();
                    }}
                  >
                    Post settlement
                  </Button>
                </>
              )}
            </div>
          </Card>
        ) : (
          i.settlement && (
            <Card title={`Settled ${prettyDate(i.settlement.settlementDate)}`}>
              {posted && <div className="mb-3"><Banner tone="good">Posted journal #{posted.id}.</Banner></div>}
              <SettlementSummary s={i.settlement} />
            </Card>
          )
        )}
        <Card title="Journal">
          <div className="flex flex-col gap-5">
            {i.journal.map((e) => (
              <JournalLines key={e.id} lines={e.lines} caption={`#${e.id} · ${e.eventType.replace('_', ' ').toLowerCase()} · ${prettyDate(e.effectiveDate)}`} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
