import type { Locale } from './types';

/** The seller reported the delivery or the buyer confirmed it: the items can be rated. */
export const canReviewOrder = (status: string): boolean =>
  status === 'DELIVERY_REPORTED' || status === 'DELIVERED';

export type StarIcon = 'star' | 'star-half' | 'star-outline';

/** Five icons for a rating, to the nearest half star. */
export function starIcons(value: number): StarIcon[] {
  const halves = Math.round(Math.min(5, Math.max(0, value)) * 2);
  return [1, 2, 3, 4, 5].map((star) =>
    halves >= star * 2 ? 'star' : halves === star * 2 - 1 ? 'star-half' : 'star-outline',
  );
}

/** "4,5" / "4.5": one decimal, as shoppers read ratings. */
export function formatRating(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-DZ' : 'fr-DZ', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

/** Width of a star-distribution bar, in percent. */
export const sharePercent = (part: number, total: number): number =>
  total <= 0 ? 0 : Math.round((Math.max(0, part) / total) * 100);

/** The comment as sent to the API: trimmed, or null when empty. */
export function cleanComment(comment: string): string | null {
  const trimmed = comment.trim();
  return trimmed === '' ? null : trimmed;
}

/** Whether the form differs from the saved review (nothing saved yet counts as changed). */
export function reviewChanged(
  saved: { readonly rating: number; readonly body: string | null } | null,
  rating: number,
  comment: string,
): boolean {
  return saved === null || saved.rating !== rating || saved.body !== cleanComment(comment);
}
