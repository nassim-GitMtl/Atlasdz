import Link from 'next/link';
import { SiteChrome } from '@/components/site-chrome';
import { NotificationReadForm } from '@/components/notification-read-form';
import { OrderError } from '@/components/order-summary';
import { customerToken } from '@/lib/cart-api';
import { listNotifications, OrderApiError } from '@/lib/orders-api';
import { orderCopy, orderDate } from '@/lib/orders-copy';
import { localizedHref, type SearchParams, resolveLocale, lang } from '@/lib/i18n';

export default async function Notifications({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const locale = resolveLocale(query.lang);
  const token = await customerToken();
  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined;
  const result = token
    ? await listNotifications(token, cursor)
        .then((data) => ({ data, error: undefined }))
        .catch((error: unknown) => ({ data: undefined, error }))
    : { data: undefined, error: new OrderApiError('auth') };
  return (
    <SiteChrome locale={locale} pathname="/notifications" searchParams={query}>
      <section className="page-container order-page">
        <h1>{lang(locale, 'Notifications', 'الإشعارات', 'Notifications')}</h1>
        <p>
          {lang(
            locale,
            'Les nouvelles de vos commandes. Les plus importantes vous sont aussi envoyées par e-mail.',
            'مستجدات طلباتك. ونرسل لك أهمها أيضًا بالبريد الإلكتروني.',
            'News about your orders. The most important ones are also sent to you by email.',
          )}
        </p>
        <Link href={localizedHref('/notifications', locale)}>
          {lang(locale, 'Actualiser la liste', 'تحديث القائمة', 'Refresh the list')}
        </Link>
        {result.data ? (
          <>
            <p role="status">
              {lang(locale, 'Non lues', 'غير مقروءة', 'Unread')} : {result.data.unreadCount}
            </p>
            <div className="order-groups">
              {result.data.items.length === 0 && (
                <p>{lang(locale, 'Aucune notification à afficher.', 'لا توجد إشعارات لعرضها.', 'No notifications to show.')}</p>
              )}
              {result.data.items.map((item) => (
                <article className="order-card" key={`${item.sellerOrderId}:${item.version}`}>
                  <p>{item.readAt ? lang(locale, 'Lue', 'مقروءة', 'Read') : lang(locale, 'Nouvelle', 'جديدة', 'New')}</p>
                  <h2>
                    {item.sellerName} · {orderCopy[locale][item.status]}
                  </h2>
                  <p>
                    <time dateTime={item.occurredAt}>{orderDate(item.occurredAt, locale)}</time>
                  </p>
                  <p>
                    {lang(locale, 'Référence vendeur', 'مرجع طلب البائع', 'Seller reference')} :{' '}
                    <bdi className="order-id">{item.sellerOrderId}</bdi>
                  </p>
                  <p>
                    <Link href={localizedHref(`/orders/${item.orderId}`, locale)}>
                      {lang(locale, 'Voir la commande', 'عرض الطلب', 'View the order')}
                    </Link>
                  </p>
                  {!item.readAt && (
                    <NotificationReadForm
                      locale={locale}
                      input={{ sellerOrderId: item.sellerOrderId, version: item.version }}
                    />
                  )}
                </article>
              ))}
            </div>
            {result.data.nextCursor && (
              <Link
                className="button button--secondary"
                href={`${localizedHref('/notifications', locale)}&cursor=${encodeURIComponent(result.data.nextCursor)}`}
              >
                {lang(locale, 'Notifications plus anciennes', 'إشعارات أقدم', 'Older notifications')}
              </Link>
            )}
          </>
        ) : (
          <OrderError error={result.error} locale={locale} path="/notifications" />
        )}
      </section>
    </SiteChrome>
  );
}
