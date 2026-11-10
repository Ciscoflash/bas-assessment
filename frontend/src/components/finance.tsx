import { ACCOUNTS, type AccountCode, type Kobo } from '../money';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { prettyDate } from '../lib/dates';
import { Badge, Banner, Money, Table, Td, Th } from './ui';

export interface ScheduleRowView {
  number: number;
  dueDate: string;
  openingBalance: Kobo;
  payment: Kobo;
  interest: Kobo;
  principal: Kobo;
  closingBalance: Kobo;
}

const STATUS_TONE = { PAID: 'good', WAIVED: 'neutral', PARTIAL: 'warn', OVERDUE: 'bad', DUE: 'warn', UPCOMING: 'neutral' } as const;

export function ScheduleTable({
  rows,
  totalInterest,
  status,
}: {
  rows: ScheduleRowView[];
  totalInterest: Kobo;
  status?: Record<number, { status: keyof typeof STATUS_TONE; outstanding: Kobo }>;
}) {
  const totalPayment = rows.reduce((a, r) => a + r.payment, 0n);
  const totalPrincipal = rows.reduce((a, r) => a + r.principal, 0n);
  return (
    <Table>
      <thead>
        <tr>
          <Th>#</Th>
          <Th>Due</Th>
          <Th right>Payment</Th>
          <Th right>Interest</Th>
          <Th right>Principal</Th>
          <Th right>Closing balance</Th>
          {status && <Th right>Outstanding</Th>}
          {status && <Th>Status</Th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.number}>
            <Td className="num">{r.number}</Td>
            <Td>{prettyDate(r.dueDate)}</Td>
            <Td right><Money value={r.payment} /></Td>
            <Td right><Money value={r.interest} /></Td>
            <Td right><Money value={r.principal} /></Td>
            <Td right><Money value={r.closingBalance} /></Td>
            {status && <Td right><Money value={status[r.number]?.outstanding ?? 0n} /></Td>}
            {status && (
              <Td>
                <Badge tone={STATUS_TONE[status[r.number]?.status ?? 'UPCOMING']}>{status[r.number]?.status ?? '—'}</Badge>
              </Td>
            )}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-semibold">
          <Td>Total</Td>
          <Td />
          <Td right><Money value={totalPayment} /></Td>
          <Td right><Money value={totalInterest} /></Td>
          <Td right><Money value={totalPrincipal} /></Td>
          <Td />
          {status && <Td />}
          {status && <Td />}
        </tr>
      </tfoot>
    </Table>
  );
}

export interface LineView {
  account: string;
  debit: Kobo;
  credit: Kobo;
}

export function JournalLines({ lines, caption }: { lines: LineView[]; caption?: string }) {
  const dr = lines.reduce((a, l) => a + l.debit, 0n);
  const cr = lines.reduce((a, l) => a + l.credit, 0n);
  return (
    <Table>
      {caption && <caption className="pb-2 text-left text-xs text-muted">{caption}</caption>}
      <thead>
        <tr>
          <Th>Account</Th>
          <Th right>Debit</Th>
          <Th right>Credit</Th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i}>
            <Td className={l.credit > 0n ? 'pl-8' : ''}>{ACCOUNTS[l.account as AccountCode]?.name ?? l.account}</Td>
            <Td right>{l.debit > 0n ? <Money value={l.debit} /> : null}</Td>
            <Td right>{l.credit > 0n ? <Money value={l.credit} /> : null}</Td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-semibold">
          <Td>
            {dr === cr ? (
              <span className="inline-flex items-center gap-1 text-good">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Balanced
              </span>
            ) : (
              <span className="text-bad">Unbalanced</span>
            )}
          </Td>
          <Td right><Money value={dr} /></Td>
          <Td right><Money value={cr} /></Td>
        </tr>
      </tfoot>
    </Table>
  );
}

export interface AllocationLineView {
  number: number;
  dueDate: string;
  penalty: Kobo;
  fee: Kobo;
  interest: Kobo;
  principal: Kobo;
}

export function AllocationTable({
  lines,
  totals,
  unapplied,
}: {
  lines: AllocationLineView[];
  totals: { penalty: Kobo; fee: Kobo; interest: Kobo; principal: Kobo };
  unapplied?: Kobo;
}) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Instalment</Th>
          <Th right>Penalty</Th>
          <Th right>Fee</Th>
          <Th right>Interest</Th>
          <Th right>Principal</Th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 && (
          <tr>
            <Td className="text-muted">No instalment is due on this date</Td>
            <Td /><Td /><Td /><Td />
          </tr>
        )}
        {lines.map((l) => (
          <tr key={l.number}>
            <Td>
              <span className="num">#{l.number}</span> <span className="text-muted">· due {prettyDate(l.dueDate)}</span>
            </Td>
            <Td right><Money value={l.penalty} /></Td>
            <Td right><Money value={l.fee} /></Td>
            <Td right><Money value={l.interest} /></Td>
            <Td right><Money value={l.principal} /></Td>
          </tr>
        ))}
        {unapplied !== undefined && unapplied > 0n && (
          <tr className="bg-warn/5">
            <Td>Unapplied credit (held as a liability)</Td>
            <Td /><Td /><Td />
            <Td right><Money value={unapplied} className="text-warn" /></Td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr className="font-semibold">
          <Td>Total applied</Td>
          <Td right><Money value={totals.penalty} /></Td>
          <Td right><Money value={totals.fee} /></Td>
          <Td right><Money value={totals.interest} /></Td>
          <Td right><Money value={totals.principal} /></Td>
        </tr>
      </tfoot>
    </Table>
  );
}

/**
 * Tie-out: the statement's closing balance (from ledger lines) against the
 * schedule's outstanding principal (from the allocation subledger). Turns red
 * and shows the difference when they disagree.
 */
export function TieOut({ statementBalance, scheduleOutstanding }: { statementBalance: Kobo; scheduleOutstanding: Kobo }) {
  const diff = statementBalance - scheduleOutstanding;
  if (diff === 0n)
    return (
      <div data-testid="tie-out" data-state="ok" className="inline-flex items-center gap-2 rounded-md border border-good/30 bg-good/10 px-3 py-2 text-sm text-good">
        <CheckCircle2 className="h-4 w-4" aria-hidden />
        <span>
          Ties out: ledger <Money value={statementBalance} /> = schedule <Money value={scheduleOutstanding} />
        </span>
      </div>
    );
  return (
    <div role="alert" data-testid="tie-out" data-state="mismatch" className="inline-flex items-center gap-2 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
      <AlertTriangle className="h-4 w-4" aria-hidden />
      <span>
        Does not tie out: ledger <Money value={statementBalance} /> vs schedule <Money value={scheduleOutstanding} /> · difference{' '}
        <strong><Money value={diff} /></strong>
      </span>
    </div>
  );
}

export interface SettlementView {
  daysOverdue: number;
  cashReceived: Kobo;
  advance: Kobo;
  reserve: Kobo;
  discountFee: Kobo;
  penalty: Kobo;
  totalCharges: Kobo;
  clientReceives: Kobo;
  clientOwes: Kobo;
}

/** Settlement waterfall. Never shows a negative "payable to client". A shortfall gets its own callout. */
export function SettlementSummary({ s }: { s: SettlementView }) {
  // Defensive clamp: even if handed inconsistent data, never render a negative payable.
  const payable = s.clientReceives > 0n ? s.clientReceives : 0n;
  const owes = s.clientOwes > 0n ? s.clientOwes : 0n;
  const row = (label: string, v: Kobo, sign = '', strong = false) => (
    <div className={`flex justify-between py-1.5 ${strong ? 'border-t border-line font-semibold' : ''}`}>
      <span className={strong ? '' : 'text-muted'}>{label}</span>
      <span className="num">
        {sign}
        <Money value={v} />
      </span>
    </div>
  );
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        {row('Reserve held', s.reserve)}
        {row('Discount fee', s.discountFee, '− ')}
        {row(`Late penalty (${s.daysOverdue} day${s.daysOverdue === 1 ? '' : 's'} overdue)`, s.penalty, '− ')}
        {row('Total charges', s.totalCharges, '', true)}
      </div>
      <div className="flex items-center justify-between rounded-md border border-line bg-canvas px-3 py-2">
        <span className="font-medium">Payable to client</span>
        <span data-testid="payable-to-client" className="text-base font-semibold">
          <Money value={payable} />
        </span>
      </div>
      {owes > 0n && (
        <Banner tone="bad">
          <div data-testid="shortfall" className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <strong>Shortfall: client owes <Money value={owes} /></strong>
              <p className="mt-0.5 text-xs">
                Charges of <Money value={s.totalCharges} /> exceed the reserve of <Money value={s.reserve} />. This amount is booked to
                Client Receivable and must be collected from the client.
              </p>
            </div>
          </div>
        </Banner>
      )}
    </div>
  );
}
