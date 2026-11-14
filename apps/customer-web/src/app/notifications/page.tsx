import Link from 'next/link';
import { SiteChrome } from '@/components/site-chrome';
import { NotificationReadForm } from '@/components/notification-read-form';
import { OrderError } from '@/components/order-summary';
import { customerToken } from '@/lib/cart-api';
import { listNotifications, OrderApiError } from '@/lib/orders-api';
import { orderCopy, orderDate } from '@/lib/orders-copy';
import { localizedHref, type SearchParams } from '@/lib/i18n';

export default async function Notifications({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const locale = query.lang === 'ar' ? 'ar' : 'fr';
  const ar = locale === 'ar';
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
        <h1>{ar ? 'الإشعارات' : 'Notifications'}</h1>
        <p>
          {ar
            ? 'تحديثات طلباتك داخل التطبيق. لا تُرسل رسائل نصية أو بريد إلكتروني حالياً.'
            : 'Les nouvelles de vos commandes dans l’application. Aucun SMS ou e-mail n’est envoyé pour le moment.'}
        </p>
        <Link href={localizedHref('/notifications', locale)}>
          {ar ? 'تحديث القائمة' : 'Actualiser la liste'}
        </Link>
        {result.data ? (
          <>
            <p role="status">
              {ar ? 'غير مقروءة' : 'Non lues'} : {result.data.unreadCount}
            </p>
            <div className="order-groups">
              {result.data.items.length === 0 && (
                <p>{ar ? 'لا توجد إشعارات لعرضها.' : 'Aucune notification à afficher.'}</p>
              )}
              {result.data.items.map((item) => (
                <article className="order-card" key={`${item.sellerOrderId}:${item.version}`}>
                  <p>{item.readAt ? (ar ? 'مقروءة' : 'Lue') : ar ? 'جديدة' : 'Nouvelle'}</p>
                  <h2>
                    {item.sellerName} · {orderCopy[locale][item.status]}
                  </h2>
                  <p>
                    <time dateTime={item.occurredAt}>{orderDate(item.occurredAt, locale)}</time>
                  </p>
                  <p>
                    {ar ? 'مرجع طلب البائع' : 'Référence vendeur'} :{' '}
                    <bdi className="order-id">{item.sellerOrderId}</bdi>
                  </p>
                  <p>
                    <Link href={localizedHref(`/orders/${item.orderId}`, locale)}>
                      {ar ? 'عرض الطلب' : 'Voir la commande'}
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
                {ar ? 'إشعارات أقدم' : 'Notifications plus anciennes'}
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
