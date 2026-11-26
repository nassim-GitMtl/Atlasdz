import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { listSellerOrders } from '@/lib/api';
import type { SellerOrder } from '@atlas/contracts';
import {
  href,
  localeFrom,
  money,
  type Locale,
  type SearchParams,
  localized,
  lang,
} from '@/lib/i18n';
import { filterOrders, ORDER_TABS, parseTab, type OrderTab } from '@/lib/order-filter';
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
  const tab = parseTab(params.tab);
  const query = typeof params.q === 'string' ? params.q.slice(0, 80) : '';
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
          {lang(locale, 'Exporter (CSV)', 'تصدير CSV', 'Export (CSV)')}
        </a>
      </div>
      <p className="notice">{t.notice}</p>
      {result.items ? (
        <OrderList orders={result.items} tab={tab} query={query} locale={locale} t={t} />
      ) : (
        <ServiceState error={result.error} locale={locale} retryPath="/orders" />
      )}
    </Shell>
  );
}

const tabLabels = {
  todo: ['À traiter', 'قيد المعالجة', 'To handle'],
  shipped: ['Expédiées', 'مشحونة', 'Shipped'],
  closed: ['Terminées', 'منتهية', 'Closed'],
  all: ['Toutes', 'الكل', 'All'],
} as const;

function OrderList({
  orders,
  tab,
  query,
  locale,
  t,
}: {
  readonly orders: readonly SellerOrder[];
  readonly tab: OrderTab;
  readonly query: string;
  readonly locale: Locale;
  readonly t: ReturnType<typeof orderText>;
}) {
  const { items, counts } = filterOrders(orders, tab, query);
  const index = locale === 'fr' ? 0 : locale === 'ar' ? 1 : 2;
  const tabHref = (which: OrderTab) =>
    `${href('/orders', locale)}&tab=${which}${query ? `&q=${encodeURIComponent(query)}` : ''}`;
  return (
    <>
      <div className="order-filters">
        <nav
          className="category-chips"
          aria-label={lang(locale, 'Filtrer les commandes', 'تصفية الطلبات', 'Filter orders')}
        >
          {ORDER_TABS.map((which) => (
            <Link
              key={which}
              href={tabHref(which)}
              className={which === tab ? 'is-selected' : ''}
              aria-current={which === tab ? 'page' : undefined}
            >
              {tabLabels[which][index]} <span className="chip-count">{counts[which]}</span>
            </Link>
          ))}
        </nav>
        <form action="/orders" className="order-search" role="search">
          <input type="hidden" name="lang" value={locale} />
          <input type="hidden" name="tab" value={tab} />
          <label htmlFor="order-q" className="sr-only">
            {lang(locale, 'Rechercher une commande', 'البحث عن طلب', 'Search orders')}
          </label>
          <input
            id="order-q"
            name="q"
            type="search"
            defaultValue={query}
            maxLength={80}
            placeholder={lang(
              locale,
              'Nom, téléphone, n° ou produit',
              'الاسم، الهاتف، الرقم أو المنتج',
              'Name, phone, number or product',
            )}
          />
          <button className="button secondary small" type="submit">
            {lang(locale, 'Rechercher', 'بحث', 'Search')}
          </button>
        </form>
      </div>
      <section className="seller-order-list">
        {items.length === 0 && (
          <div className="empty-state">
            <h2>
              {orders.length === 0
                ? t.empty
                : lang(
                    locale,
                    'Aucune commande ne correspond.',
                    'لا يوجد طلب مطابق.',
                    'No matching order.',
                  )}
            </h2>
          </div>
        )}
        {items.map((order) => (
          <article className="seller-order-card" key={order.id}>
            <div className="order-row__head">
              <h2>
                <Link href={href(`/orders/${order.id}`, locale)}>
                  {order.snapshot.items
                    .map((item) => `${localized(item.title, locale)} × ${item.quantity}`)
                    .join(', ')}
                </Link>
              </h2>
              <span className={`badge badge--${statusTone(order.status)}`}>{t[order.status]}</span>
            </div>
            <p className="order-row__meta">
              {t.recorded}: {orderDate(order.createdAt, locale)} · {t.total}:{' '}
              <bdi>{money(order.snapshot.totalMinor, locale)}</bdi>
              {order.deliveryContact && (
                <>
                  {' '}
                  · <bdi>{order.deliveryContact.recipientName}</bdi>
                  {order.snapshot.deliveryRate
                    ? ` (${localized(order.snapshot.deliveryRate.destination.name, locale)})`
                    : ''}
                </>
              )}
            </p>
            <p className="order-row__meta">
              <span className="mono" title={order.id}>
                {order.id.slice(0, 8)}
              </span>
              {order.status === 'AWAITING_SELLER' && (
                <>
                  {' '}
                  · {t.deadline}: {orderDate(order.acceptanceDeadline, locale)}
                </>
              )}
            </p>
            <Link
              className={
                order.status === 'AWAITING_SELLER' ? 'button small' : 'button secondary small'
              }
              href={href(`/orders/${order.id}`, locale)}
            >
              {t.detail}
            </Link>
          </article>
        ))}
      </section>
    </>
  );
}
