import { Plus, Warning } from '@phosphor-icons/react/dist/ssr';
import Link from 'next/link';
import type { SellerOrder } from '@atlas/contracts';
import { listOfferProducts, listOffers, listSellerOrders, listSupport } from '@/lib/api';
import { dashboardCopy, fill } from '@/lib/dashboard-copy';
import { href, money, type Locale, localized, intlLocale } from '@/lib/i18n';

const LOW_STOCK = 3;
const time = (value: string, locale: Locale) =>
  new Intl.DateTimeFormat(intlLocale(locale), {
    timeStyle: 'short',
    hourCycle: 'h23',
    timeZone: 'Africa/Algiers',
  }).format(new Date(value));
const today = (locale: Locale) =>
  new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Algiers',
  }).format(new Date());

/** Delivered and confirmed in the last 30 days: what customers paid (not profit). */
function deliveredSince(orders: readonly SellerOrder[], days = 30) {
  const since = Date.now() - days * 86_400_000;
  const recent = orders.filter((order) => {
    if (order.status !== 'DELIVERED') return false;
    const at = order.history.find((entry) => entry.status === 'DELIVERED')?.occurredAt;
    return at !== undefined && new Date(at).getTime() >= since;
  });
  return { count: recent.length, totalMinor: recent.reduce((sum, o) => sum + o.snapshot.totalMinor, 0) };
}

/** What a seller has to do now, from their own orders, offers and customer requests. */
export async function SellerDashboard({ token, locale }: { readonly token: string; readonly locale: Locale }) {
  const t = dashboardCopy[locale];
  // Each block degrades on its own: one failing call never hides the others.
  const [orders, offers, products, support] = await Promise.all([
    listSellerOrders(token).then((r) => r.items).catch(() => null),
    listOffers(token).then((r) => r.items).catch(() => null),
    listOfferProducts(token).then((r) => r.items).catch(() => []),
    listSupport(token, false).catch(() => null),
  ]);
  const all = orders ?? [];
  const count = (...statuses: SellerOrder['status'][]) => all.filter((o) => statuses.includes(o.status)).length;
  const waiting = all
    .filter((o) => o.status === 'AWAITING_SELLER')
    .sort((a, b) => a.acceptanceDeadline.localeCompare(b.acceptanceDeadline));
  const first = waiting[0];
  const low = (offers ?? [])
    .filter((offer) => offer.status === 'APPROVED' && offer.availableQuantity <= LOW_STOCK)
    .sort((a, b) => a.availableQuantity - b.availableQuantity)
    .slice(0, 4);
  const titleOf = (productId: string) =>
    localized(products.find((p) => p.id === productId)?.title, locale) ?? '—';
  const cases = support?.items ?? [];
  const more = support?.nextCursor ? '+' : '';
  const sales = deliveredSince(all);
  const storeName = all[0]?.snapshot.sellerName;

  return (
    <div className="dashboard">
      <header className="dashboard-head">
        <div>
          <span className="dashboard-date">
            {today(locale)}
            {storeName ? ` · ${storeName}` : ''}
          </span>
          <h1>{t.title}</h1>
        </div>
        <Link className="button" href={href('/offers/new', locale)}>
          <Plus aria-hidden="true" size={16} weight="bold" />
          {t.addOffer}
        </Link>
      </header>
      {(orders === null || offers === null || support === null) && <p className="notice">{t.unavailable}</p>}

      <div className="priority-grid">
        <Link className="priority-card priority-card--main" href={href('/orders', locale)}>
          <span>{t.toAccept}</span>
          <strong>{waiting.length}</strong>
          <small>{first ? fill(t.acceptBefore, { time: time(first.acceptanceDeadline, locale) }) : t.nothingToAccept}</small>
        </Link>
        <Link className="priority-card" href={href('/orders', locale)}>
          <span>{t.preparing}</span>
          <strong>{count('ACCEPTED', 'PREPARING')}</strong>
          <small>{t.preparingBody}</small>
        </Link>
        <Link className="priority-card" href={href('/orders', locale)}>
          <span>{t.inDelivery}</span>
          <strong>{count('SHIPPED', 'DELIVERY_REPORTED')}</strong>
          <small>{t.inDeliveryBody}</small>
        </Link>
      </div>

      <div className="dashboard-grid">
        <section className="panel" aria-labelledby="accept-title">
          <div className="panel-head">
            <h2 id="accept-title">{t.tableTitle}</h2>
            <span>{t.sorted}</span>
          </div>
          {waiting.length === 0 ? (
            <p className="panel-empty">{t.nothingToAccept}</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">{t.received}</th>
                    <th scope="col">{t.customer}</th>
                    <th scope="col">{t.items}</th>
                    <th scope="col" className="num">{t.total}</th>
                    <th scope="col">{t.deadline}</th>
                    <th scope="col"><span className="sr-only">{t.open}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {waiting.map((order, index) => (
                    <tr key={order.id}>
                      <td className="muted">{time(order.createdAt, locale)}</td>
                      <td>{order.deliveryContact?.recipientName ?? '—'}</td>
                      <td>
                        {order.snapshot.items.map((item) => `${localized(item.title, locale)} × ${item.quantity}`).join(', ')}
                      </td>
                      <td className="num strong"><bdi>{money(order.snapshot.totalMinor, locale)}</bdi></td>
                      <td>
                        <span className={index === 0 ? 'deadline deadline--soon' : 'deadline'}>
                          {time(order.acceptanceDeadline, locale)}
                        </span>
                      </td>
                      <td className="end">
                        <Link className="button small" href={href(`/orders/${order.id}`, locale)}>
                          {t.open}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="panel-note">{t.totalNote}</p>
        </section>

        <div className="side-panels">
          {low.length > 0 && (
            <section className="panel panel--pad" aria-labelledby="stock-title">
              <h2 id="stock-title" className="panel-title">
                <Warning aria-hidden="true" size={18} className="warn" />
                {t.lowStock}
              </h2>
              <ul className="plain-list">
                {low.map((offer) => (
                  <li key={offer.id}>
                    <span>
                      {titleOf(offer.productId)}
                      <small className="warn">{fill(t.left, { n: offer.availableQuantity })}</small>
                    </span>
                    <Link href={href(`/offers/${offer.id}`, locale)}>{t.update}</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="panel panel--pad" aria-labelledby="requests-title">
            <h2 id="requests-title" className="panel-title">{t.requests}</h2>
            <p className="kv">
              <span>{t.awaitingYou}</span>
              <strong>{cases.filter((c) => c.status === 'OPEN').length}{more}</strong>
            </p>
            <p className="kv muted">
              <span>{t.awaitingCustomer}</span>
              <strong>{cases.filter((c) => c.status === 'WAITING_CUSTOMER').length}{more}</strong>
            </p>
            <Link href={href('/support', locale)}>{t.answer}</Link>
          </section>
          <section className="panel panel--dark" aria-labelledby="sales-title">
            <h2 id="sales-title">{t.delivered}</h2>
            <strong><bdi>{money(sales.totalMinor, locale)}</bdi></strong>
            <p>{fill(t.deliveredBody, { n: sales.count })}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
