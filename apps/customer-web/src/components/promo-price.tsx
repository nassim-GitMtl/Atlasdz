import type { Locale } from '@/lib/i18n';
import { formatMoney } from '@/lib/catalog-view';

/** A running seller promotion: discount, the seller's real regular price, and the end date. */
export function PromoPrice({
  priceMinor,
  regularPriceMinor,
  endsAt,
  locale,
  compact = false,
}: {
  readonly priceMinor: number;
  readonly regularPriceMinor?: number | null | undefined;
  readonly endsAt?: string | null | undefined;
  readonly locale: Locale;
  readonly compact?: boolean;
}) {
  if (!regularPriceMinor || regularPriceMinor <= priceMinor) return null;
  const percent = Math.round((1 - priceMinor / regularPriceMinor) * 100);
  const until = endsAt
    ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-DZ' : 'fr-DZ', {
        day: 'numeric',
        month: 'long',
        timeZone: 'Africa/Algiers',
      }).format(new Date(endsAt))
    : null;
  return (
    <span className="promo-price">
      <span className="promo-tag">{locale === 'ar' ? `تخفيض −${percent}٪` : `Promo −${percent} %`}</span>
      <s>
        <span className="sr-only">{locale === 'ar' ? 'السعر المعتاد: ' : 'Prix habituel : '}</span>
        <bdi>{formatMoney(regularPriceMinor, locale)}</bdi>
      </s>
      {!compact && until && (
        <small>{locale === 'ar' ? `حتى ${until}` : `jusqu’au ${until}`}</small>
      )}
    </span>
  );
}
