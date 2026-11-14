import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { listSellerOrders } from '@/lib/api';
import { href, localeFrom, money, type SearchParams } from '@/lib/i18n';
import { liveCheckoutEnabled, orderText, orderDate } from '@/lib/orders-copy';
import { localAccountsEnabled } from '@/lib/security';
import { accessToken } from '@/lib/session';
export default async function Orders({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = localeFrom(params.lang);
  const t = orderText(locale, liveCheckoutEnabled());
  const token = await accessToken();
  if (!token) redirect(href('/', locale));
  const local = localAccountsEnabled(process.env, (await headers()).get('host'));
  const result = await listSellerOrders(token)
    .then((data) => ({ items: data.items, error: undefined }))
    .catch((error: unknown) => ({ items: undefined, error }));
  return (
    <Shell locale={locale} currentPath="/orders" signedIn local={local}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{t.title}</span>
          <h1>{t.inbox}</h1>
          <p>{t.body}</p>
        </div>
      </div>
      <p className="notice">{t.notice}</p>
      {result.items ? (
        <section className="seller-order-list">
          {result.items.length === 0 && (
            <div className="empty-state">
              <h2>{t.empty}</h2>
            </div>
          )}
          {result.items.map((order) => (
            <article className="seller-order-card" key={order.id}>
              <span className="badge">{t[order.status]}</span>
              <h2>
                <Link href={href(`/orders/${order.id}`, locale)}>{t.detail}</Link>
              </h2>
              <p className="mono">{order.id}</p>
              <p>{order.snapshot.sellerName}</p>
              <ul>
                {order.snapshot.items.map((item) => (
                  <li key={item.offerId}>
                    {item.title[locale]} × {item.quantity}
                  </li>
                ))}
              </ul>
              <p>
                {t.total}: <bdi>{money(order.snapshot.totalMinor, locale)}</bdi>
              </p>
              <p>
                {t.recorded}: {orderDate(order.createdAt, locale)}
              </p>
              <Link className="button secondary" href={href(`/orders/${order.id}`, locale)}>
                {t.detail}
              </Link>
            </article>
          ))}
        </section>
      ) : (
        <ServiceState error={result.error} locale={locale} retryPath="/orders" />
      )}
    </Shell>
  );
}
