import Link from 'next/link';
import { UuidSchema } from '@atlas/contracts';
import { SiteChrome } from '@/components/site-chrome';
import { OrderForm } from '@/components/order-forms';
import { ReviewForm } from '@/components/review-form';
import { reviewCopy } from '@/lib/review-copy';
import { SellerSummary, OrderError, DeliveryContactSummary } from '@/components/order-summary';
import { customerToken } from '@/lib/cart-api';
import { getOrder, OrderApiError } from '@/lib/orders-api';
import { getOrderReviews } from '@/lib/reviews-api';
import { liveCheckoutEnabled, orderText, orderDate } from '@/lib/orders-copy';
import { orderProgress } from '@/lib/order-progress';
import { formatMoney } from '@/lib/catalog-view';
import { localizedHref, type SearchParams } from '@/lib/i18n';
export default async function OrderDetail({
  params,
  searchParams,
}: {
  readonly params: Promise<{ orderId: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const { orderId } = await params;
  const query = await searchParams;
  const locale = query.lang === 'ar' ? 'ar' : 'fr';
  const t = orderText(locale, liveCheckoutEnabled());
  const path = `/orders/${orderId}`;
  const token = await customerToken();
  const result = await (async () => {
    if (!token) throw new OrderApiError('auth');
    if (!UuidSchema.safeParse(orderId).success) throw new OrderApiError('missing');
    return getOrder(token, orderId);
  })()
    .then((order) => ({ order, error: undefined }))
    .catch((error: unknown) => ({ order: undefined, error }));
  // Delivered parts of the order can be rated; a failure only hides the rating forms.
  const reviews = new Map(
    await Promise.all(
      (result.order?.sellerOrders ?? [])
        .filter((seller) => ['DELIVERY_REPORTED', 'DELIVERED'].includes(seller.status))
        .map(
          async (seller) =>
            [
              seller.id,
              token ? await getOrderReviews(token, seller.id).catch(() => null) : null,
            ] as const,
        ),
    ),
  );
  const rate = reviewCopy[locale];
  return (
    <SiteChrome locale={locale} pathname={path} searchParams={query}>
      <section className="page-container order-page">
        <Link href={localizedHref('/orders', locale)}>{t.title}</Link>
        <h1>{query.placed === '1' && result.order ? t.received : t.detail}</h1>
        <p className="cart-notice">{t.notice}</p>
        {result.order ? (
          <>
            <p className="order-id">
              <bdi>{orderId}</bdi>
            </p>
            <p>
              {t.originalTotal}:{' '}
              <strong>
                <bdi>{formatMoney(result.order.quote.totalMinor, locale)}</bdi>
              </strong>
            </p>
            <p role="status">{t[orderProgress(result.order.sellerOrders)]}</p>
            <div className="order-groups">
              <DeliveryContactSummary
                contact={result.order.quote.deliveryContact}
                locale={locale}
              />
              {result.order.sellerOrders.map((seller) => (
                <article className="order-card" key={seller.id}>
                  <p className="order-status" role="status">
                    {t[seller.status]}
                  </p>
                  <SellerSummary
                    snapshot={seller.snapshot}
                    locale={locale}
                    placedAt={seller.createdAt}
                  />
                  <Link href={`${localizedHref('/support', locale)}&sellerOrderId=${seller.id}`}>
                    {locale === 'ar'
                      ? 'التواصل مع البائع / طلب إرجاع'
                      : 'Contacter le vendeur / demander un retour'}
                  </Link>
                  <p>
                    {t.seller}: <bdi className="order-id">{seller.id}</bdi>
                  </p>
                  <p>
                    {t.deadline}:{' '}
                    <time dateTime={seller.acceptanceDeadline}>
                      {orderDate(seller.acceptanceDeadline, locale)}
                    </time>
                  </p>
                  {seller.status === 'AWAITING_SELLER' && (
                    <OrderForm
                      live={liveCheckoutEnabled()}
                      kind="cancel"
                      id={seller.id}
                      version={seller.version}
                      locale={locale}
                    />
                  )}
                  {seller.rejectionReason && (
                    <p>
                      {t.reason}: {t[seller.rejectionReason]}
                    </p>
                  )}
                  {seller.shipment && (
                    <>
                      <p>
                        {t.carrier}: {seller.shipment.carrier}
                      </p>
                      <p>
                        {t.tracking}: <bdi>{seller.shipment.trackingReference}</bdi>
                      </p>
                    </>
                  )}
                  {seller.status === 'DELIVERY_REPORTED' && (
                    <OrderForm
                      live={liveCheckoutEnabled()}
                      kind="receipt"
                      id={seller.id}
                      version={seller.version}
                      locale={locale}
                    />
                  )}
                  <h3>{t.history}</h3>
                  <ol className="order-history">
                    {seller.history.map((entry) => (
                      <li key={entry.version}>
                        <strong>{t[entry.status]}</strong>
                        <p>
                          {t[entry.attribution]} ·{' '}
                          <time dateTime={entry.occurredAt}>
                            {orderDate(entry.occurredAt, locale)}
                          </time>
                        </p>
                      </li>
                    ))}
                  </ol>
                  {reviews.get(seller.id)?.canReview && result.order && (
                    <section className="order-reviews" aria-label={rate.title}>
                      <h3>{rate.title}</h3>
                      <p className="auth-hint">{rate.hint}</p>
                      {reviews.get(seller.id)?.items.map((item) => (
                        <ReviewForm
                          key={item.productId}
                          orderId={result.order.id}
                          sellerOrderId={seller.id}
                          item={item}
                          locale={locale}
                        />
                      ))}
                    </section>
                  )}
                </article>
              ))}
            </div>
            <Link className="button button--secondary" href={localizedHref('/search', locale)}>
              {t.browse}
            </Link>
          </>
        ) : (
          <OrderError error={result.error} locale={locale} path={path} />
        )}
      </section>
    </SiteChrome>
  );
}
