import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AccountActionForm, SellerStatusForm } from '@/components/admin-forms';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { AdminApiError, getSellerDetail } from '@/lib/admin';
import { accountsCopy } from '@/lib/accounts-copy';
import { href, localeFrom, money, type SearchParams, localized } from '@/lib/i18n';
import { orderDate, orderText } from '@/lib/orders-copy';
import { accessToken } from '@/lib/session';

const tone = (status: string) =>
  status === 'DELIVERED' || status === 'APPROVED'
    ? 'good'
    : ['CANCELLED', 'REJECTED', 'EXPIRED', 'DELIVERY_FAILED', 'SUSPENDED'].includes(status)
      ? 'bad'
      : 'wait';

/** Staff view of one seller account: everything it holds, and every action on it. */
export default async function AdminSeller({
  params,
  searchParams,
}: {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const locale = localeFrom(query.lang);
  const t = accountsCopy[locale];
  const o = orderText(locale, true);
  const token = await accessToken();
  if (!token) redirect(href('/login', locale));
  const result = await getSellerDetail(token, id)
    .then((data) => ({ data, error: undefined }))
    .catch((error: unknown) => ({ data: undefined, error }));
  if (result.error instanceof AdminApiError && result.error.code === 'invalid') notFound();
  const d = result.data;
  const closed = Boolean(d?.seller.closedAt);
  return (
    <Shell locale={locale} currentPath="/admin/sellers" signedIn>
      <Link href={href('/admin/sellers', locale)}>← {t.back}</Link>
      {!d ? (
        <ServiceState error={result.error} locale={locale} retryPath={`/admin/sellers/${id}`} />
      ) : (
        <div className="dashboard">
          <header className="dashboard-head">
            <div>
              <span className="dashboard-date">/{d.seller.slug}</span>
              <h1>{d.seller.name}</h1>
            </div>
            <span className={`badge badge--${closed ? 'bad' : tone(d.seller.status)}`}>
              {closed ? t.closed : d.seller.status}
            </span>
          </header>

          <div className="admin-grid">
            <section className="panel panel--pad" aria-labelledby="profile">
              <h2 id="profile" className="panel-title">{t.profile}</h2>
              <dl className="kv-list">
                <dt>{t.created}</dt>
                <dd>{orderDate(d.seller.createdAt, locale)}</dd>
                <dt>{t.coverage}</dt>
                <dd>{d.activeDeliveryRates}</dd>
                {d.seller.suspendedReason && (
                  <>
                    <dt>{t.status}</dt>
                    <dd>{d.seller.suspendedReason}</dd>
                  </>
                )}
              </dl>
              <p>{localized(d.seller.description, locale)}</p>
              {!closed && (
                <SellerStatusForm
                  locale={locale}
                  seller={{
                    sellerId: d.seller.sellerId,
                    slug: d.seller.slug,
                    name: d.seller.name,
                    status: d.seller.status,
                    suspendedReason: d.seller.suspendedReason,
                    createdAt: d.seller.createdAt,
                    approvedOffers: d.offers.filter((x) => x.status === 'APPROVED').length,
                    orders: d.orders.length,
                  }}
                />
              )}
            </section>
            <section className="panel panel--pad" aria-labelledby="logins">
              <h2 id="logins" className="panel-title">{t.users}</h2>
              <ul className="plain-list">
                {d.users.map((user) => (
                  <li key={user.userId}>
                    <span>
                      {user.email}
                      <small>{[user.phone, user.status].filter(Boolean).join(' · ')}</small>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="kv">
                <span>{t.orders}</span>
                <strong>
                  {Object.entries(d.orderCounts)
                    .map(([status, count]) => `${o[status as keyof typeof o] ?? status}: ${count}`)
                    .join(' · ') || '0'}
                </strong>
              </p>
            </section>
          </div>

          <section className="panel" aria-labelledby="offers">
            <div className="panel-head">
              <h2 id="offers">{t.offers}</h2>
              <span>{d.offers.length}</span>
            </div>
            {d.offers.length === 0 ? (
              <p className="panel-empty">{t.none}</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">{t.product}</th>
                      <th scope="col" className="num">{t.price}</th>
                      <th scope="col" className="num">{t.stock}</th>
                      <th scope="col">{t.status}</th>
                      <th scope="col">{t.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.offers.map((offer) => (
                      <tr key={offer.offerId}>
                        <td>
                          <strong>{localized(offer.title, locale)}</strong>
                          {offer.promotion && (
                            <small className="promo-note">
                              {t.promo} {money(offer.promotion.priceMinor, locale)}
                            </small>
                          )}
                        </td>
                        <td className="num strong"><bdi>{money(offer.priceMinor, locale)}</bdi></td>
                        <td className="num">{offer.availableQuantity}</td>
                        <td><span className={`badge badge--${tone(offer.status)}`}>{offer.status}</span></td>
                        <td>
                          <div className="decision">
                            {offer.status === 'SUSPENDED' ? (
                              !closed && <AccountActionForm action="restore-offer" id={offer.offerId} label={t.restore} locale={locale} />
                            ) : (
                              <AccountActionForm action="suspend-offer" id={offer.offerId} label={t.suspend} locale={locale} />
                            )}
                            <AccountActionForm action="remove-offer" id={offer.offerId} label={t.removeOffer} locale={locale} danger warning={t.removeOfferWarn} />
                            <AccountActionForm action="remove-product" id={offer.productId} label={t.removeProduct} locale={locale} danger warning={t.removeProductWarn} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="admin-grid">
            <section className="panel" aria-labelledby="orders">
              <div className="panel-head">
                <h2 id="orders">{t.orders}</h2>
              </div>
              {d.orders.length === 0 ? (
                <p className="panel-empty">{t.none}</p>
              ) : (
                <ul className="plain-list panel-list">
                  {d.orders.map((order) => (
                    <li key={order.sellerOrderId}>
                      <span>
                        {order.recipient ?? '—'} · <bdi>{money(order.totalMinor, locale)}</bdi>
                        <small>{orderDate(order.createdAt, locale)} · <span className="mono">{order.sellerOrderId.slice(0, 8)}</span></small>
                      </span>
                      <span className={`badge badge--${tone(order.status)}`}>{o[order.status as keyof typeof o] ?? order.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel" aria-labelledby="reviews">
              <div className="panel-head">
                <h2 id="reviews">{t.reviews}</h2>
                <span>{d.reviews.length}</span>
              </div>
              {d.reviews.length === 0 ? (
                <p className="panel-empty">{t.none}</p>
              ) : (
                <ul className="plain-list panel-list">
                  {d.reviews.map((review) => (
                    <li key={review.reviewId}>
                      <span>
                        {'★'.repeat(review.rating)} · {review.product}
                        <small>{review.body ?? ''}</small>
                      </span>
                      <AccountActionForm action="delete-review" id={review.reviewId} label={t.deleteReview} locale={locale} danger warning={t.deleteReviewWarn} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {!closed && (
            <section className="panel panel--pad danger-zone" aria-labelledby="danger">
              <h2 id="danger" className="panel-title">{t.danger}</h2>
              <p>{t.dangerBody}</p>
              <AccountActionForm action="close-seller" id={d.seller.sellerId} label={t.danger} locale={locale} danger warning={t.dangerWarn} />
            </section>
          )}
        </div>
      )}
    </Shell>
  );
}
