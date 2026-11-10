/**
 * Calendar dates as ISO strings "YYYY-MM-DD". No time zones and no Date objects:
 * day counts come from integer civil-date arithmetic.
 */
export type IsoDate = string;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y: number, m: number) =>
  [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;

export function parseIsoDate(s: string): { y: number; m: number; d: number } {
  const match = typeof s === 'string' ? ISO.exec(s) : null;
  if (!match) throw new TypeError(`Invalid date: ${String(s)}`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) throw new TypeError(`Invalid date: ${s}`);
  return { y, m, d };
}

export function isValidIsoDate(s: string): boolean {
  try {
    parseIsoDate(s);
    return true;
  } catch {
    return false;
  }
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
export const formatIsoDate = (y: number, m: number, d: number): IsoDate => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

/** Days since 1970-01-01 (Howard Hinnant's days_from_civil). */
export function dayNumber(s: IsoDate): number {
  let { y, m, d } = parseIsoDate(s);
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** later − earlier, in days (negative if `to` is before `from`). */
export const daysBetween = (from: IsoDate, to: IsoDate) => dayNumber(to) - dayNumber(from);

export const compareDates = (a: IsoDate, b: IsoDate) => Math.sign(dayNumber(a) - dayNumber(b));

/** Add whole months, clamping to month end (Jan 31 + 1 month → Feb 28/29). */
export function addMonths(s: IsoDate, months: number): IsoDate {
  const { y, m, d } = parseIsoDate(s);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return formatIsoDate(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addDays(s: IsoDate, days: number): IsoDate {
  // civil_from_days
  const z = dayNumber(s) + days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return formatIsoDate(y, m, d);
}
