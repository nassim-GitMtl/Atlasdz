import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { NotificationReadForm } from '@/components/notification-read-form';
import { listNotifications } from '@/lib/api';
import { href, localeFrom, type SearchParams, lang } from '@/lib/i18n';
import { orderCopy, orderDate } from '@/lib/orders-copy';
import { localAccountsEnabled } from '@/lib/security';
import { accessToken } from '@/lib/session';

export default async function Notifications({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const locale = localeFrom(query.lang);
  const token = await accessToken();
  if (!token) redirect(href('/', locale));
  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined;
  const local = localAccountsEnabled(process.env, (await headers()).get('host'));
  const result = await listNotifications(token, cursor)
    .then((data) => ({ data, error: undefined }))
    .catch((error: unknown) => ({ data: undefined, error }));
  return (
    <Shell locale={locale} currentPath="/notifications" signedIn local={local}>
      <div className="page-heading">
        <div>
          <h1>{lang(locale, 'Notifications', 'الإشعارات', 'Notifications')}</h1>
          <p>
            {lang(
              locale,
              'Les nouvelles des commandes de votre boutique. Lire une notification n’accepte pas la commande et ne change pas son statut.',
              'تحديثات طلبات متجرك. قراءة الإشعار لا تقبل الطلب ولا تغيّر حالته.',
              'News about your shop’s orders. Reading a notification does not accept the order or change its status.',
            )}
          </p>
        </div>
      </div>
      <p className="notice">
        {lang(
          locale,
          'Les nouvelles commandes, rappels et décisions sur vos offres vous sont aussi envoyés par e-mail.',
          'تصلك الطلبات الجديدة والتذكيرات وقرارات العروض أيضًا بالبريد الإلكتروني.',
          'New orders, reminders and decisions on your offers are also sent to you by email.',
        )}
      </p>
      <Link href={href('/notifications', locale)}>
        {lang(locale, 'Actualiser la liste', 'تحديث القائمة', 'Refresh the list')}
      </Link>
      {result.data ? (
        <>
          <p role="status">
            {lang(locale, 'Non lues', 'غير مقروءة', 'Unread')} : {result.data.unreadCount}
          </p>
          <section className="seller-order-list">
            {result.data.items.length === 0 && (
              <p>{lang(locale, 'Aucune notification à afficher.', 'لا توجد إشعارات لعرضها.', 'No notifications to show.')}</p>
            )}
            {result.data.items.map((item) => (
              <article className="seller-order-card" key={`${item.sellerOrderId}:${item.version}`}>
                <span className="badge">
                  {item.readAt ? lang(locale, 'Lue', 'مقروءة', 'Read') : lang(locale, 'Nouvelle', 'جديدة', 'New')}
                </span>
                <h2>{orderCopy[locale][item.status]}</h2>
                <p className="mono">{item.sellerOrderId}</p>
                <p>
                  <time dateTime={item.occurredAt}>{orderDate(item.occurredAt, locale)}</time>
                </p>
                <p>
                  <Link href={href(`/orders/${item.sellerOrderId}`, locale)}>
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
          </section>
          {result.data.nextCursor && (
            <Link
              className="button secondary"
              href={`${href('/notifications', locale)}&cursor=${encodeURIComponent(result.data.nextCursor)}`}
            >
              {lang(locale, 'Notifications plus anciennes', 'إشعارات أقدم', 'Older notifications')}
            </Link>
          )}
        </>
      ) : (
        <ServiceState error={result.error} locale={locale} retryPath="/notifications" />
      )}
    </Shell>
  );
}
