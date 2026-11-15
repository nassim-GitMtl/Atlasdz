import { fill, formatDate } from './format';
import type { Strings } from './strings';
import type { Locale, Preorder } from './types';

/** "Livraison estimée sous 20 à 35 jours · Provenance : Turquie". */
export function preorderText(preorder: Preorder, t: Strings['preorder']): string {
  const window = fill(t.window, { min: preorder.minDays, max: preorder.maxDays });
  return preorder.origin ? `${window} · ${fill(t.origin, { origin: preorder.origin })}` : window;
}

/** The widest window among pre-order items: what the buyer accepts at checkout. */
export function preorderSpan(
  items: readonly { readonly preorder?: Preorder | null | undefined }[],
): { readonly min: number; readonly max: number } | null {
  const terms = items.flatMap((item) => (item.preorder ? [item.preorder] : []));
  if (terms.length === 0) return null;
  return {
    min: Math.min(...terms.map((term) => term.minDays)),
    max: Math.max(...terms.map((term) => term.maxDays)),
  };
}

/** Estimated delivery dates of a pre-order placed at `placedAt`. */
export function preorderDates(
  placedAt: string,
  preorder: Preorder,
  t: Strings['preorder'],
  locale: Locale,
): string {
  const at = (days: number) =>
    formatDate(new Date(new Date(placedAt).getTime() + days * 86_400_000).toISOString(), locale);
  return fill(t.between, { from: at(preorder.minDays), to: at(preorder.maxDays) });
}

/** Seller form → API value: null (in stock), the terms, or 'invalid'. */
export function parsePreorder(
  enabled: boolean,
  min: string,
  max: string,
  origin: string,
): Preorder | null | 'invalid' {
  if (!enabled) return null;
  const days = (value: string) => (/^\d{1,3}$/.test(value.trim()) ? Number(value.trim()) : NaN);
  const minDays = days(min);
  const maxDays = days(max);
  const from = origin.trim();
  if (!(minDays >= 1 && maxDays <= 180 && maxDays >= minDays)) return 'invalid';
  if (from.length === 1 || from.length > 60) return 'invalid';
  return { minDays, maxDays, origin: from === '' ? null : from };
}
