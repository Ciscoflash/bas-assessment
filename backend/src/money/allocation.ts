import { compareDates, type IsoDate } from './dates.js';
import { min, type Kobo } from './money.js';

/** The four buckets, in waterfall order. */
export const COMPONENTS = ['penalty', 'fee', 'interest', 'principal'] as const;
export type Component = (typeof COMPONENTS)[number];
export type Buckets = Record<Component, Kobo>;

export const emptyBuckets = (): Buckets => ({ penalty: 0n, fee: 0n, interest: 0n, principal: 0n });

/** An instalment as it stands: what was scheduled, what's been paid, what's been waived. */
export interface InstalmentState {
  number: number;
  dueDate: IsoDate;
  due: Buckets;
  paid: Buckets;
  /** Amounts written off (only interest, on early payoff). */
  waived: Buckets;
}

export const outstanding = (s: InstalmentState, c: Component): Kobo => s.due[c] - s.paid[c] - s.waived[c];
export const outstandingTotal = (s: InstalmentState): Kobo =>
  COMPONENTS.reduce((a, c) => a + outstanding(s, c), 0n);

export interface AllocationLine extends Buckets {
  number: number;
  dueDate: IsoDate;
}

export interface Allocation {
  amount: Kobo;
  lines: AllocationLine[];
  totals: Buckets;
  unappliedCredit: Kobo;
}

/**
 * Apply a payment: oldest unpaid instalment that is due (dueDate ≤ paymentDate)
 * first; inside each, penalty → fee → interest → principal. Whatever is left
 * becomes unapplied customer credit. Instalments not yet due are never touched.
 */
export function allocate(instalments: readonly InstalmentState[], amount: Kobo, paymentDate: IsoDate): Allocation {
  if (amount <= 0n) throw new RangeError('Payment amount must be positive');
  const ordered = [...instalments].sort((a, b) => compareDates(a.dueDate, b.dueDate) || a.number - b.number);
  let remaining = amount;
  const lines: AllocationLine[] = [];
  const totals = emptyBuckets();

  for (const inst of ordered) {
    if (remaining === 0n) break;
    if (compareDates(inst.dueDate, paymentDate) > 0) break; // not due yet; later ones aren't either
    if (outstandingTotal(inst) === 0n) continue;
    const line: AllocationLine = { number: inst.number, dueDate: inst.dueDate, ...emptyBuckets() };
    for (const c of COMPONENTS) {
      const take = min(remaining, outstanding(inst, c));
      line[c] = take;
      totals[c] += take;
      remaining -= take;
    }
    lines.push(line);
  }

  return { amount, lines, totals, unappliedCredit: remaining };
}

/** Apply an allocation to instalment state (pure; returns new objects). */
export function applyAllocation(instalments: readonly InstalmentState[], allocation: Allocation): InstalmentState[] {
  const byNumber = new Map(allocation.lines.map((l) => [l.number, l]));
  return instalments.map((s) => {
    const line = byNumber.get(s.number);
    if (!line) return s;
    const paid = { ...s.paid };
    for (const c of COMPONENTS) paid[c] += line[c];
    return { ...s, paid };
  });
}

export const outstandingPrincipal = (instalments: readonly InstalmentState[]): Kobo =>
  instalments.reduce((a, s) => a + outstanding(s, 'principal'), 0n);
