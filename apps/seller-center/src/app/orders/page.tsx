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
/** Colour family for a status: needs you, done, stopped, or under way. */
function statusTone(status: string): 'action' | 'good' | 'bad' | 'wait' {
  if (status === 'AWAITING_SELLER') return 'action';
  if (status === 'DELIVERED') return 'good';
  if (['DELIVERY_FAILED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(status)) return 'bad';
  return 'wait';
}

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
        <a className="button secondary" href="/orders/export" download>
          {locale === 'ar' ? 'تصدير CSV' : 'Exporter (CSV)'}
        </a>
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
              <div className="order-row__head">
                <h2>
                  <Link href={href(`/orders/${order.id}`, locale)}>
                    {order.snapshot.items
                      .map((item) => `${item.title[locale]} × ${item.quantity}`)
                      .join(', ')}
                  </Link>
                </h2>
                <span className={`badge badge--${statusTone(order.status)}`}>{t[order.status]}</span>
              </div>
              <p className="order-row__meta">
                {t.recorded}: {orderDate(order.createdAt, locale)} · {t.total}:{' '}
                <bdi>{money(order.snapshot.totalMinor, locale)}</bdi>
              </p>
              <p className="order-row__meta">
                <span className="mono" title={order.id}>
                  {order.id.slice(0, 8)}
                </span>
                {order.status === 'AWAITING_SELLER' && (
                  <> · {t.deadline}: {orderDate(order.acceptanceDeadline, locale)}</>
                )}
              </p>
              <Link
                className={order.status === 'AWAITING_SELLER' ? 'button small' : 'button secondary small'}
                href={href(`/orders/${order.id}`, locale)}
              >
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
