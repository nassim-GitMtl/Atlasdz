import type { Locale, Localized } from './types';

/** Same rules as the shop website: dinars, no forced decimals. */
export function formatMoney(amountMinor: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-DZ' : 'fr-DZ', {
    style: 'currency',
    currency: 'DZD',
    // Whole dinars, or both centime digits (4 500,50 DA, not 4 500,5 DA).
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

const region = (locale: Locale) => (locale === 'ar' ? 'ar-DZ' : 'fr-DZ');

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

export const localized = (text: Localized, locale: Locale) => text[locale] || text.fr;

/** Fills `{name}` placeholders: fill('{n} vendeurs', { n: 3 }). */
export const fill = (template: string, values: Readonly<Record<string, string | number>>) =>
  template.replace(/\{(\w+)\}/g, (match, key: string) =>
    values[key] === undefined ? match : String(values[key]),
  );

/** Phone as the API expects it (digits with an optional leading +). */
export const normalizePhone = (raw: string) => raw.replace(/[\s.-]/g, '');
