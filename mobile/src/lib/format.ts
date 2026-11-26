import type { Locale, Localized } from './types';

/** Same rules as the shop website: dinars, no forced decimals. */
const region = (locale: Locale) =>
  locale === 'ar' ? 'ar-DZ' : locale === 'en' ? 'en-GB' : 'fr-DZ';

export function formatMoney(amountMinor: number, locale: Locale): string {
  return new Intl.NumberFormat(region(locale), {
    style: 'currency',
    currency: 'DZD',
    // Whole dinars, or both centime digits (4 500,50 DA, not 4 500,5 DA).
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}



/** Dates as in Algeria; times on the 24-hour clock (14:30), which CLDR's fr-DZ does not default to. */
export function formatDate(iso: string, locale: Locale, withTime = false): string {
  const date = new Intl.DateTimeFormat(region(locale), { dateStyle: 'medium' }).format(
    new Date(iso),
  );
  return withTime ? `${date}, ${formatTime(iso, locale)}` : date;
}

export function formatTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(region(locale), {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

export const localized = (text: Localized, locale: Locale) => text[locale] ?? text.fr;

/** Fills `{name}` placeholders: fill('{n} vendeurs', { n: 3 }). */
export const fill = (template: string, values: Readonly<Record<string, string | number>>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    values[key] === undefined ? match : String(values[key]),
  );

/** Phone as the API expects it (digits with an optional leading +). */
export const normalizePhone = (raw: string) => raw.replace(/[\s.-]/g, '');

const arDays = (n: number) =>
  n === 1 ? 'يوم واحد' : n === 2 ? 'يومان' : n <= 10 ? `${n} أيام` : `${n} يومًا`;

/** "2 à 4 jours": the delivery time a seller states for a commune (after shipping). */
export function formatDeliveryDays(days: { min: number; max: number }, locale: Locale): string {
  const { min, max } = days;
  if (min === max)
    return locale === 'ar' ? arDays(min) : locale === 'en' ? `${min} day${min > 1 ? 's' : ''}` : `${min} jour${min > 1 ? 's' : ''}`;
  if (locale === 'ar') return `من ${min} إلى ${max} ${max <= 10 ? 'أيام' : 'يومًا'}`;
  return locale === 'en' ? `${min}–${max} days` : `${min} à ${max} jours`;
}
