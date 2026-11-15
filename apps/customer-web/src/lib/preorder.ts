import type { Preorder } from '@atlas/contracts';
import type { Locale } from './i18n.ts';

export const preorderCopy = {
  fr: {
    badge: 'Précommande',
    window: (p: Preorder) => `Livraison estimée sous ${p.minDays} à ${p.maxDays} jours`,
    origin: (origin: string) => `Provenance : ${origin}`,
    add: 'Précommander',
    accept: (min: number, max: number) =>
      `J’accepte la précommande : article pas encore en stock, livraison estimée sous ${min} à ${max} jours. Je peux l’annuler tant que le vendeur ne l’a pas acceptée.`,
    between: (from: string, to: string) => `Livraison estimée entre le ${from} et le ${to}`,
  },
  en: {
    badge: 'Pre-order',
    window: (p: Preorder) => `Estimated delivery in ${p.minDays} to ${p.maxDays} days`,
    origin: (origin: string) => `Ships from: ${origin}`,
    add: 'Pre-order',
    accept: (min: number, max: number) =>
      `I accept the pre-order: item not in stock yet, estimated delivery in ${min} to ${max} days. I can cancel it until the seller accepts it.`,
    between: (from: string, to: string) => `Estimated delivery between ${from} and ${to}`,
  },
  ar: {
    badge: 'طلب مسبق',
    window: (p: Preorder) => `التوصيل المتوقع خلال ${p.minDays} إلى ${p.maxDays} يومًا`,
    origin: (origin: string) => `المصدر: ${origin}`,
    add: 'اطلب مسبقًا',
    accept: (min: number, max: number) =>
      `أوافق على الطلب المسبق: المنتج غير متوفر بعد، والتوصيل المتوقع خلال ${min} إلى ${max} يومًا. يمكنني إلغاؤه ما دام البائع لم يقبله.`,
    between: (from: string, to: string) => `التوصيل المتوقع بين ${from} و${to}`,
  },
} as const;

/** "Livraison estimée sous 20 à 35 jours · Provenance : Turquie". */
export function preorderText(preorder: Preorder, locale: Locale): string {
  const t = preorderCopy[locale];
  return preorder.origin
    ? `${t.window(preorder)} · ${t.origin(preorder.origin)}`
    : t.window(preorder);
}

/** The widest window among pre-order items (what the buyer must accept). */
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
export function preorderDates(placedAt: string, preorder: Preorder, locale: Locale): string {
  const day = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-DZ' : 'fr-DZ', { dateStyle: 'medium' });
  const start = new Date(placedAt).getTime();
  const at = (days: number) => day.format(new Date(start + days * 86_400_000));
  return preorderCopy[locale].between(at(preorder.minDays), at(preorder.maxDays));
}
