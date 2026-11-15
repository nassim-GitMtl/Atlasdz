import { ProductPhoto } from './product-photo';
import Link from 'next/link';
import type { DeliveryContact, SellerOrderSnapshot } from '@atlas/contracts';
import { formatMoney } from '@/lib/catalog-view';
import { localizedHref, type Locale, contentLocale } from '@/lib/i18n';
import { OrderApiError } from '@/lib/orders-api';
import { liveCheckoutEnabled, orderText } from '@/lib/orders-copy';
import { preorderCopy, preorderDates, preorderText } from '@/lib/preorder';
export function DeliveryContactSummary({
  contact,
  locale,
}: {
  readonly contact?: DeliveryContact | undefined;
  readonly locale: Locale;
}) {
  const t = orderText(locale, liveCheckoutEnabled());
  return (
    <section className="order-card delivery-contact-summary">
      <h2>{t.deliveryContact}</h2>
      {contact ? (
        <dl>
          {(['recipientName', 'phone', 'addressLine', 'city'] as const).map((field) => (
            <div key={field}>
              <dt>{t[field]}</dt>
              <dd>
                <bdi dir={field === 'phone' ? 'ltr' : 'auto'}>{contact[field]}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p>{t.contactMissing}</p>
      )}
    </section>
  );
}
export function SellerSummary({
  snapshot,
  locale,
  placedAt,
}: {
  readonly snapshot: SellerOrderSnapshot;
  readonly locale: Locale;
  /** Order date: pre-order items then show estimated delivery dates. */
  readonly placedAt?: string;
}) {
  const t = orderText(locale, liveCheckoutEnabled());
  return (
    <>
      <h2>{snapshot.sellerName}</h2>
      {snapshot.deliveryRate && (
        <>
          <p>
            {t.destination}: {snapshot.deliveryRate.destination.name[contentLocale(locale)]}
          </p>
          <p>
            {t.codCollector}:{' '}
            {snapshot.deliveryRate.codCollector === 'SELLER' ? t.codSeller : t.codCourier}
          </p>
        </>
      )}
      <ul className="order-items">
        {snapshot.items.map((item) => (
          <li key={item.offerId}>
            <ProductPhoto src={item.imageUrl} width={72} height={72} alt="" />
            <div>
              <h3>{item.title[contentLocale(locale)]}</h3>
              <p>
                {t.quantity}: {item.quantity} · {t.unit}:{' '}
                <bdi>{formatMoney(item.unitPriceMinor, locale)}</bdi>
              </p>
              {item.preorder ? (
                <p className="preorder-note">
                  <strong className="preorder-badge">{preorderCopy[locale].badge}</strong>{' '}
                  {placedAt
                    ? preorderDates(placedAt, item.preorder, locale)
                    : preorderText(item.preorder, locale)}
                </p>
              ) : (
                <p>
                  {t.handling}: {item.handlingDays}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      <dl className="order-totals">
        <div>
          <dt>{t.subtotal}</dt>
          <dd>
            <bdi>{formatMoney(snapshot.itemsSubtotalMinor, locale)}</bdi>
          </dd>
        </div>
        <div>
          <dt>{t.shipping}</dt>
          <dd>
            <bdi>{formatMoney(snapshot.shippingFeeMinor, locale)}</bdi>
          </dd>
        </div>
        <div>
          <dt>{t.total}</dt>
          <dd>
            <bdi>{formatMoney(snapshot.totalMinor, locale)}</bdi>
          </dd>
        </div>
      </dl>
    </>
  );
}
export function OrderError({
  error,
  locale,
  path,
}: {
  readonly error: unknown;
  readonly locale: Locale;
  readonly path: string;
}) {
  const t = orderText(locale, liveCheckoutEnabled());
  const code = error instanceof OrderApiError ? error.code : 'unavailable';
  return (
    <div className="cart-empty" role="status">
      <p>{t[code]}</p>
      <a
        className="button button--secondary"
        href={localizedHref(code === 'auth' ? '/login' : path, locale)}
      >
        {code === 'auth' ? t.login : t.retry}
      </a>
      <Link href={localizedHref('/cart', locale)}>{t.cart}</Link>
    </div>
  );
}
