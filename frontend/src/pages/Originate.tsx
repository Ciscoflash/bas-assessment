import {
  buildSchedule,
  createLoanRequest,
  journalEntryWire,
  koboToWire,
  loanViewWire,
  nairaInputToKobo,
  scheduleWire,
  type JournalEntryView,
} from '../money';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { JournalLines, ScheduleTable } from '../components/finance';
import { Banner, Button, Card, Field, FormError, Money, Stat } from '../components/ui';
import { ApiError, api, newIdempotencyKey } from '../lib/api';
import { todayIso } from '../lib/dates';
import { deepEqual } from '../lib/deepEqual';
import { validate } from '../lib/form';

type Schedule = z.infer<typeof scheduleWire>;
const createdWire = z.object({ loan: loanViewWire, journalEntry: journalEntryWire });

interface FormState {
  borrowerName: string;
  principal: string; // naira text as typed
  annualRatePct: string;
  termMonths: string;
  startDate: string;
}

export function OriginatePage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>({ borrowerName: '', principal: '', annualRatePct: '', termMonths: '', startDate: todayIso() });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [quote, setQuote] = useState<{ request: z.infer<typeof createLoanRequest>; schedule: Schedule } | null>(null);
  const [posted, setPosted] = useState<{ loanId: number; entry: JournalEntryView } | null>(null);
  // One idempotency key per quote: a double-click (or retry) of Approve reuses it.
  const approveKey = useRef<string | null>(null);
  const inFlight = useRef(false);

  const toRequest = (f: FormState) => {
    const kobo = nairaInputToKobo(f.principal);
    return {
      borrowerName: f.borrowerName,
      principal: kobo === null ? f.principal : koboToWire(kobo),
      annualRatePct: f.annualRatePct.trim(),
      termMonths: /^\d+$/.test(f.termMonths) ? Number(f.termMonths) : f.termMonths,
      startDate: f.startDate,
    };
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: '' }));
    // Any edit invalidates the quote (and its key).
    setQuote(null);
    approveKey.current = null;
  };

  // Instant local preview (shared implementation) — never posted, only compared.
  const localPreview = useMemo(() => {
    const v = validate(createLoanRequest.omit({ borrowerName: true }), toRequest(form));
    if (!v.ok) return null;
    return buildSchedule({ ...v.data, principal: BigInt(v.data.principal) });
  }, [form]);

  const quoteMutation = useMutation({
    mutationFn: (req: z.infer<typeof createLoanRequest>) =>
      api('POST', '/loans/quote', { body: req, schema: scheduleWire }).then((schedule) => ({ request: req, schedule })),
    onSuccess: (q) => {
      setQuote(q);
      setPosted(null);
      approveKey.current = newIdempotencyKey();
    },
    onError: (e) => e instanceof ApiError && setErrors(e.byField()),
  });

  const approve = useMutation({
    mutationFn: () => {
      if (!quote || !approveKey.current) throw new Error('Get a quote first');
      return api('POST', '/loans', { body: quote.request, idempotencyKey: approveKey.current, schema: createdWire });
    },
    onSuccess: (res) => {
      setPosted({ loanId: res.loan.id, entry: res.journalEntry });
      qc.invalidateQueries({ queryKey: ['loans'] });
    },
    onError: (e) => e instanceof ApiError && setErrors(e.byField()),
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const onQuote = (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate(createLoanRequest, toRequest(form));
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    quoteMutation.mutate(v.data);
  };

  const onApprove = () => {
    if (inFlight.current || posted) return; // guard against double-click before re-render
    inFlight.current = true;
    approve.mutate();
  };

  const parityOk = quote && localPreview ? deepEqual(quote.schedule, localPreview) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card title="New term loan">
        <form onSubmit={onQuote} noValidate className="flex flex-col gap-4">
          <Field label="Borrower name" name="borrowerName" value={form.borrowerName} onChange={set('borrowerName')} error={errors.borrowerName} autoComplete="off" required />
          <Field
            label="Principal"
            name="principal"
            prefix="₦"
            inputMode="decimal"
            placeholder="1,200,000"
            value={form.principal}
            onChange={set('principal')}
            error={errors.principal}
            hint="Naira, up to 2 decimal places"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Annual rate" name="annualRatePct" suffix="%" inputMode="decimal" placeholder="18" value={form.annualRatePct} onChange={set('annualRatePct')} error={errors.annualRatePct} required />
            <Field label="Term" name="termMonths" suffix="months" inputMode="numeric" placeholder="6" value={form.termMonths} onChange={set('termMonths')} error={errors.termMonths} required />
          </div>
          <Field label="Disbursement date" name="startDate" type="date" value={form.startDate} onChange={set('startDate')} error={errors.startDate} required />
          <FormError message={errors._} />
          {quoteMutation.error && !(quoteMutation.error instanceof ApiError && quoteMutation.error.fieldErrors.length) && (
            <FormError message={quoteMutation.error.message} />
          )}
          <Button type="submit" variant="secondary" loading={quoteMutation.isPending}>
            Get quote
          </Button>
          {localPreview && !quote && (
            <p className="text-xs text-muted">
              Preview instalment: <Money value={localPreview.instalment} /> / month. Get a quote to confirm with the server.
            </p>
          )}
        </form>
      </Card>

      <div className="flex min-w-0 flex-col gap-6">
        {!quote && (
          <Card>
            <p className="text-sm text-muted">Fill in the loan details and get a quote. The server computes the schedule; your browser checks it against its own preview.</p>
          </Card>
        )}
        {quote && (
          <Card
            title="Repayment schedule (server quote)"
            actions={
              parityOk ? (
                <span className="text-xs text-good">Matches browser preview to the kobo</span>
              ) : (
                <span className="text-xs text-bad">Server ≠ preview — the server's figures will be used</span>
              )
            }
          >
            <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Principal"><Money value={BigInt(quote.request.principal)} /></Stat>
              <Stat label="Monthly instalment"><Money value={quote.schedule.instalment} /></Stat>
              <Stat label="Total interest"><Money value={quote.schedule.totalInterest} /></Stat>
              <Stat label="Total repayable"><Money value={quote.schedule.totalPayment} /></Stat>
            </div>
            <ScheduleTable rows={quote.schedule.rows} totalInterest={quote.schedule.totalInterest} />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {!posted && (
                <Button onClick={onApprove} loading={approve.isPending} disabled={approve.isPending}>
                  Approve and disburse
                </Button>
              )}
              {approve.error && !(approve.error instanceof ApiError && approve.error.fieldErrors.length) && (
                <FormError message={approve.error.message} />
              )}
            </div>
          </Card>
        )}
        {posted && (
          <Card title={`Disbursement posted · journal #${posted.entry.id}`} actions={<Link className="text-sm font-medium text-brand underline" to={`/loans/${posted.loanId}`}>Open loan →</Link>}>
            <Banner tone="good">Loan #{posted.loanId} is active. This is the entry the server posted.</Banner>
            <div className="mt-3">
              <JournalLines lines={posted.entry.lines} />
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
