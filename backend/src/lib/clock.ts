import { formatIsoDate } from '../money/index.js';
import { config } from '../config.js';

/** Today's calendar date in the business time zone (BUSINESS_UTC_OFFSET_MINUTES). Display status only, never money. */
export function today(): string {
  const now = new Date(Date.now() + config.businessUtcOffsetMinutes * 60_000);
  return formatIsoDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}
