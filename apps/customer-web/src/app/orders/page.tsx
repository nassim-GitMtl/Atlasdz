import Link from 'next/link';
import { SiteChrome } from '@/components/site-chrome';
import { OrderError } from '@/components/order-summary';
import { customerToken } from '@/lib/cart-api';
import { listOrders, OrderApiError } from '@/lib/orders-api';
import { liveCheckoutEnabled, orderText, orderDate } from '@/lib/orders-copy';
import { orderProgress } from '@/lib/order-progress';
import { formatMoney } from '@/lib/catalog-view';
import { localizedHref, type SearchParams } from '@/lib/i18n';
export default async function Orders({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const locale = query.lang === 'ar' ? 'ar' : 'fr';
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
                <h2>
                  <Link href={localizedHref(`/orders/${order.id}`, locale)}>
                    {t.detail} <bdi className="order-id">{order.id}</bdi>
                  </Link>
                </h2>
                <p>
                  {t.originalTotal}: <bdi>{formatMoney(order.quote.totalMinor, locale)}</bdi>
                </p>
                {order.sellerOrders[0] && (
                  <p>
                    {t.recorded}: {orderDate(order.sellerOrders[0].createdAt, locale)}
                  </p>
                )}
                <p>{t[orderProgress(order.sellerOrders)]}</p>
                <ul>
                  {order.sellerOrders.map((seller) => (
                    <li key={seller.id}>
                      {seller.snapshot.sellerName}: {t[seller.status]}
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
