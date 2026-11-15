import { CheckoutSteps } from '@/components/checkout-steps';
import Link from 'next/link';
import { UuidSchema } from '@atlas/contracts';
import { headers } from 'next/headers';
import { SiteChrome } from '@/components/site-chrome';
import { OrderForm } from '@/components/order-forms';
import { SellerSummary, OrderError, DeliveryContactSummary } from '@/components/order-summary';
import { customerToken } from '@/lib/cart-api';
import { getQuote, OrderApiError } from '@/lib/orders-api';
import { customerCheckoutEnabled } from '@/lib/customer-security';
import { liveCheckoutEnabled, orderText, orderDate } from '@/lib/orders-copy';
import { formatMoney } from '@/lib/catalog-view';
import { localizedHref, type SearchParams } from '@/lib/i18n';
export default async function Checkout({
  params,
  searchParams,
}: {
  readonly params: Promise<{ quoteId: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const { quoteId } = await params;
  const query = await searchParams;
  const locale = query.lang === 'ar' ? 'ar' : 'fr';
  const t = orderText(locale, liveCheckoutEnabled());
  const path = `/checkout/${quoteId}`;
  const token = await customerToken();
  const result = await (async () => {
    if (!token) throw new OrderApiError('auth');
    if (!customerCheckoutEnabled(process.env, (await headers()).get('host')))
      throw new OrderApiError('disabled');
    if (!UuidSchema.safeParse(quoteId).success) throw new OrderApiError('missing');
    return getQuote(token, quoteId);
  })()
    .then((quote) => ({ quote, error: undefined }))
    .catch((error: unknown) => ({ quote: undefined, error }));
  return (
    <SiteChrome locale={locale} pathname={path} searchParams={query}>
      <section className="page-container order-page">
        <CheckoutSteps locale={locale} current={1} />
        <h1>{t.checkout}</h1>
        <p className="cart-notice">{t.notice}</p>
        {result.quote ? (
          <>
            <div className="cart-layout">
              <div className="order-groups">
                <DeliveryContactSummary contact={result.quote.deliveryContact} locale={locale} />
                <p>{t.contactReview}</p>
                {result.quote.sellers.map((seller) => (
                  <article className="order-card" key={seller.sellerId}>
                    <SellerSummary snapshot={seller} locale={locale} />
                  </article>
                ))}
              </div>
              <aside className="cart-summary">
                <h2>{t.total}</h2>
                <strong>
                  <bdi>{formatMoney(result.quote.totalMinor, locale)}</bdi>
                </strong>
                <p>
                  {t.expires}:{' '}
                  <time dateTime={result.quote.expiresAt}>
                    {orderDate(result.quote.expiresAt, locale)}
                  </time>
                </p>
                <p>{result.quote.destination ? t.destinationPolicy : t.policy}</p>
                {result.quote.deliveryContact ? (
                  <OrderForm
                    live={liveCheckoutEnabled()}
                    kind="place"
                    id={quoteId}
                    locale={locale}
                  />
                ) : (
                  <p role="alert">{t.changed}</p>
                )}
                <Link href={localizedHref('/cart', locale)}>{t.cart}</Link>
              </aside>
            </div>
          </>
        ) : (
          <OrderError error={result.error} locale={locale} path={path} />
        )}
      </section>
    </SiteChrome>
  );
}
