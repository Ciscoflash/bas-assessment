import { formatIsoDate } from '../money';

export function todayIso(): string {
  const d = new Date();
  return formatIsoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-02-15" → "15 Feb 2026" (string-only, no time zone). */
export function prettyDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}
