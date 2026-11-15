import type { OfferPromotion } from './types';
import { parseDinars } from './collections';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A seller's promotion from the form: whole days in Algiers time (UTC+1), at most 90 days,
 * strictly below the regular price. Null when the box is off; 'invalid' when incomplete.
 */
export function parsePromotion(
  enabled: boolean,
  price: string,
  start: string,
  end: string,
  regularMinor: number | null,
): OfferPromotion | null | 'invalid' {
  if (!enabled) return null;
  const priceMinor = parseDinars(price);
  if (priceMinor === null || priceMinor <= 0 || regularMinor === null || priceMinor >= regularMinor)
    return 'invalid';
  if (!DAY.test(start.trim()) || !DAY.test(end.trim())) return 'invalid';
  const startsAt = `${start.trim()}T00:00:00+01:00`;
  const endsAt = `${end.trim()}T23:59:59+01:00`;
  const span = Date.parse(endsAt) - Date.parse(startsAt);
  if (!Number.isFinite(span) || span <= 0 || span > 90 * 86_400_000) return 'invalid';
  return { priceMinor, startsAt, endsAt };
}

/** yyyy-mm-dd of an instant in Algiers time, to prefill the form. */
export const algiersDay = (iso: string) =>
  new Date(Date.parse(iso) + 3_600_000).toISOString().slice(0, 10);

/** Whole-percent discount shown next to the real regular price. */
export const discountPercent = (priceMinor: number, regularMinor: number) =>
  Math.round((1 - priceMinor / regularMinor) * 100);
