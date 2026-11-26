import Link from 'next/link';
import { UuidSchema } from '@atlas/contracts';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Shell } from '@/components/shell';
import { deliveryCopy } from '@/lib/delivery-copy';
import { ServiceState } from '@/components/states';
import { RejectOrderForm } from '@/components/reject-order-form';
import { ProcessOrderForm } from '@/components/process-order-form';
import { CustomerSignalPanel } from '@/components/customer-signal';
import { OrderNotes } from '@/components/order-notes';
import { customerSignal } from '@/lib/auth';
import { getSellerOrder, listOrderNotes } from '@/lib/api';
import { href, localeFrom, money, type SearchParams, localized, lang } from '@/lib/i18n';
import { liveCheckoutEnabled, orderDate, orderText } from '@/lib/orders-copy';
import { localAccountsEnabled } from '@/lib/security';
import { accessToken } from '@/lib/session';
export default async function OrderDetail({
  params,
  searchParams,
}: {
  readonly params: Promise<{ sellerOrderId: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const { sellerOrderId } = await params;
  const query = await searchParams;
  const locale = localeFrom(query.lang);
  const t = orderText(locale, liveCheckoutEnabled());
  const path = `/orders/${sellerOrderId}`;
  if (!UuidSchema.safeParse(sellerOrderId).success) notFound();
  const token = await accessToken();
  if (!token) redirect(href('/', locale));
  const local = localAccountsEnabled(process.env, (await headers()).get('host'));
  const [result, signal, notes] = await Promise.all([
    getSellerOrder(token, sellerOrderId)
      .then((order) => ({ order, error: undefined }))
      .catch((error: unknown) => ({ order: undefined, error })),
    customerSignal(token, sellerOrderId),
    // Optional: an outage hides the follow-up, not the order.
    listOrderNotes(token, sellerOrderId)
      .then((data) => data.items)
      .catch(() => null),
  ]);
  return (
    <Shell locale={locale} currentPath={path} signedIn local={local}>
      <Link href={href('/orders', locale)}>{t.inbox}</Link>
      <div className="page-heading">
        <h1>{t.detail}</h1>
      </div>
      <p className="notice">{t.notice}</p>
      {result.order ? (
        <article className="seller-order-card">
          <span className="badge" role="status">
            {t[result.order.status]}
          </span>
          <h2>{result.order.snapshot.sellerName}</h2>
          {signal && result.order.dataClass === 'live' && (
            <CustomerSignalPanel signal={signal} locale={locale} />
          )}
          <Link href={`${href('/support', locale)}&sellerOrderId=${sellerOrderId}`}>
            {lang(locale, 'Demandes d’aide et de retour', 'طلبات المساعدة والإرجاع', 'Help and return requests')}
          </Link>
          <p>
            {t.id}: <bdi className="mono">{result.order.id}</bdi>
          </p>
          <Link className="button secondary small" href={href(`/orders/${sellerOrderId}/print`, locale)}>
            {lang(locale, 'Imprimer le récapitulatif (à joindre au colis)', 'طباعة ملخص الطلب (يُرفق بالطرد)', 'Print the summary (for the parcel)')}
          </Link>
          <ul className="seller-order-items">
            {result.order.snapshot.items.map((item) => (
              <li key={item.offerId}>
                <h3>{localized(item.title, locale)}</h3>
                <p>
                  {t.quantity}: {item.quantity} · {t.unit}:{' '}
                  <bdi>{money(item.unitPriceMinor, locale)}</bdi>
                </p>
              </li>
            ))}
          </ul>
          {result.order.snapshot.deliveryRate && (
            <div className="notice">
              <p>{localized(result.order.snapshot.deliveryRate.destination.name, locale)}</p>
              <p>
                {deliveryCopy[locale].collector}{' '}
                {deliveryCopy[locale][result.order.snapshot.deliveryRate.codCollector]}
              </p>
            </div>
          )}
          {notes && <OrderNotes sellerOrderId={sellerOrderId} notes={notes} locale={locale} />}
          <section className="delivery-contact-summary">
            <h2>{t.deliveryContact}</h2>
            <p>{t.contactHint}</p>
            {result.order.deliveryContact ? (
              <dl>
                {(['recipientName', 'phone', 'addressLine', 'city', 'note'] as const)
                  .filter((field) => result.order?.deliveryContact?.[field])
                  .map((field) => (
                  <div key={field}>
                    <dt>
                      {field === 'note'
                        ? lang(locale, 'Indications pour le livreur', 'إرشادات لعامل التوصيل', 'Notes for the courier')
                        : t[field]}
                    </dt>
                    <dd>
                      <bdi dir={field === 'phone' ? 'ltr' : 'auto'}>
                        {result.order?.deliveryContact?.[field]}
                      </bdi>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>{t.contactMissing}</p>
            )}
          </section>
          <dl className="seller-order-totals">
            <div>
              <dt>{t.items}</dt>
              <dd>
                <bdi>{money(result.order.snapshot.itemsSubtotalMinor, locale)}</bdi>
              </dd>
            </div>
            <div>
              <dt>{t.shipping}</dt>
              <dd>
                <bdi>{money(result.order.snapshot.shippingFeeMinor, locale)}</bdi>
              </dd>
            </div>
            <div>
              <dt>{t.total}</dt>
              <dd>
                <bdi>{money(result.order.snapshot.totalMinor, locale)}</bdi>
              </dd>
            </div>
          </dl>
          <p>
            {t.deadline}:{' '}
            <time dateTime={result.order.acceptanceDeadline}>
              {orderDate(result.order.acceptanceDeadline, locale)}
            </time>
          </p>
          {result.order.rejectionReason && (
            <p>
              {t.reason}: {t[result.order.rejectionReason]}
            </p>
          )}
          {result.order.shipment && (
            <>
              <p>
                {t.carrier}: {result.order.shipment.carrier}
              </p>
              <p>
                {t.tracking}: <bdi>{result.order.shipment.trackingReference}</bdi>
              </p>
            </>
          )}
          <ProcessOrderForm key={result.order.version} order={result.order} locale={locale} />
          {result.order.status === 'AWAITING_SELLER' && (
            // Refusing needs a reason sent to the customer; it comes after the main action.
            <RejectOrderForm
              id={sellerOrderId}
              version={result.order.version}
              locale={locale}
              live={result.order.dataClass === 'live'}
            />
          )}
          <h2>{t.history}</h2>
          <ol className="order-history">
            {result.order.history.map((entry) => (
              <li key={entry.version}>
                <strong>{t[entry.status]}</strong>
                <p>
                  {t[entry.attribution]} ·{' '}
                  <time dateTime={entry.occurredAt}>{orderDate(entry.occurredAt, locale)}</time>
                </p>
              </li>
            ))}
          </ol>
        </article>
      ) : (
        <ServiceState error={result.error} locale={locale} retryPath={path} />
      )}
    </Shell>
  );
}
