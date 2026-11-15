import Link from 'next/link';
import { SiteChrome } from '@/components/site-chrome';
import { OrderError } from '@/components/order-summary';
import { customerToken } from '@/lib/cart-api';
import { listOrders, OrderApiError } from '@/lib/orders-api';
import { liveCheckoutEnabled, orderText, orderDate } from '@/lib/orders-copy';
import { orderProgress } from '@/lib/order-progress';
import { formatMoney } from '@/lib/catalog-view';
import { localizedHref, type SearchParams, resolveLocale } from '@/lib/i18n';
/** Colour family for a status: done, stopped, or still in progress. */
function statusTone(status: string): 'good' | 'bad' | 'wait' {
  if (status === 'DELIVERED') return 'good';
  if (['DELIVERY_FAILED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'CLOSED'].includes(status)) return 'bad';
  return 'wait';
}

export default async function Orders({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const locale = resolveLocale(query.lang);
  const t = orderText(locale, liveCheckoutEnabled());
  const token = await customerToken();
  const result = token
    ? await listOrders(token)
        .then((data) => ({ items: data.items, error: undefined }))
        .catch((error: unknown) => ({ items: undefined, error }))
    : { items: undefined, error: new OrderApiError('auth') };
  return (
    <SiteChrome locale={locale} pathname="/orders" searchParams={query}>
      <section className="page-container order-page">
        <h1>{t.title}</h1>
        <p className="cart-notice">{t.notice}</p>
        {result.items ? (
          <div className="order-groups">
            {result.items.length === 0 && <p>{t.empty}</p>}
            {result.items.map((order) => (
              <article className="order-card" key={order.id}>
                <div className="order-card__head">
                  <h2>
                    <Link href={localizedHref(`/orders/${order.id}`, locale)}>
                      {t.detail}{' '}
                      <bdi className="order-id" title={order.id}>
                        {order.id}
                      </bdi>
                    </Link>
                  </h2>
                  <span className={`status-badge status-badge--${statusTone(orderProgress(order.sellerOrders))}`}>
                    {t[orderProgress(order.sellerOrders)]}
                  </span>
                </div>
                <p className="order-card__meta">
                  {order.sellerOrders[0] && (
                    <>
                      {t.recorded}: {orderDate(order.sellerOrders[0].createdAt, locale)} ·{' '}
                    </>
                  )}
                  {t.originalTotal}: <bdi>{formatMoney(order.quote.totalMinor, locale)}</bdi>
                </p>
                <ul className="order-card__sellers">
                  {order.sellerOrders.map((seller) => (
                    <li key={seller.id}>
                      <span>{seller.snapshot.sellerName}</span>
                      <span className={`status-badge status-badge--${statusTone(seller.status)}`}>
                        {t[seller.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <OrderError error={result.error} locale={locale} path="/orders" />
        )}
      </section>
    </SiteChrome>
  );
}
