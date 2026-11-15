import type { Locale } from '@/lib/i18n';
import { lang, intlLocale } from '@/lib/i18n';
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
    ? new Intl.DateTimeFormat(intlLocale(locale), {
        day: 'numeric',
        month: 'long',
        timeZone: 'Africa/Algiers',
      }).format(new Date(endsAt))
    : null;
  return (
    <span className="promo-price">
      <span className="promo-tag">{lang(locale, `Promo −${percent} %`, `تخفيض −${percent}٪`, `Sale −${percent}%`)}</span>
      <s>
        <span className="sr-only">{lang(locale, 'Prix habituel : ', 'السعر المعتاد: ', 'Usual price: ')}</span>
        <bdi>{formatMoney(regularPriceMinor, locale)}</bdi>
      </s>
      {!compact && until && (
        <small>{lang(locale, `jusqu’au ${until}`, `حتى ${until}`, `until ${until}`)}</small>
      )}
    </span>
  );
}
