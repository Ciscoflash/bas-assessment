import { COMPONENTS, emptyBuckets, outstanding, type AllocationLine, type Buckets, type InstalmentState } from './allocation.js';
import { compareDates, type IsoDate } from './dates.js';
import type { Kobo } from './money.js';

export interface WaivedLine extends Buckets {
  number: number;
}

export interface PayoffQuote {
  asOfDate: IsoDate;
  /** What gets collected per instalment: everything owed on due ones, principal only on future ones. */
  lines: AllocationLine[];
  totals: Buckets;
  /** Charges on not-yet-due instalments that paying off early cancels (unearned interest). */
  waived: WaivedLine[];
  interestWaived: Kobo;
  total: Kobo;
}

/**
 * Early payoff: every instalment already due is cleared in full (penalty, fee,
 * interest, principal). Instalments not yet due only need their principal;
 * their scheduled interest (and any other charge) is waived because it hasn't been earned.
 */
export function payoffQuote(instalments: readonly InstalmentState[], asOfDate: IsoDate): PayoffQuote {
  const ordered = [...instalments].sort((a, b) => compareDates(a.dueDate, b.dueDate) || a.number - b.number);
  const lines: AllocationLine[] = [];
  const waived: WaivedLine[] = [];
  const totals = emptyBuckets();

  for (const inst of ordered) {
    const isDue = compareDates(inst.dueDate, asOfDate) <= 0;
    const line: AllocationLine = { number: inst.number, dueDate: inst.dueDate, ...emptyBuckets() };
    const waive: WaivedLine = { number: inst.number, ...emptyBuckets() };
    for (const c of COMPONENTS) {
      const owed = outstanding(inst, c);
      if (isDue || c === 'principal') {
        line[c] = owed;
        totals[c] += owed;
      } else {
        waive[c] = owed;
      }
    }
    if (COMPONENTS.some((c) => line[c] > 0n)) lines.push(line);
    if (COMPONENTS.some((c) => waive[c] > 0n)) waived.push(waive);
  }

  return {
    asOfDate,
    lines,
    totals,
    waived,
    interestWaived: waived.reduce((a, w) => a + w.interest, 0n),
    total: COMPONENTS.reduce((a, c) => a + totals[c], 0n),
  };
}
