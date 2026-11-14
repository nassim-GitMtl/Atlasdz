import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { NotificationReadForm } from '@/components/notification-read-form';
import { listNotifications } from '@/lib/api';
import { href, localeFrom, type SearchParams } from '@/lib/i18n';
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
  const ar = locale === 'ar';
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
          <h1>{ar ? 'الإشعارات' : 'Notifications'}</h1>
          <p>
            {ar
              ? 'تحديثات طلبات متجرك. قراءة الإشعار لا تقبل الطلب ولا تغيّر حالته.'
              : 'Les nouvelles des commandes de votre boutique. Lire une notification n’accepte pas la commande et ne change pas son statut.'}
          </p>
        </div>
      </div>
      <p className="notice">
        {ar
          ? 'داخل التطبيق فقط. لا تُرسل رسائل نصية أو بريد إلكتروني حالياً.'
          : 'Dans l’application uniquement. Aucun SMS ou e-mail envoyé pour le moment.'}
      </p>
      <Link href={href('/notifications', locale)}>
        {ar ? 'تحديث القائمة' : 'Actualiser la liste'}
      </Link>
      {result.data ? (
        <>
          <p role="status">
            {ar ? 'غير مقروءة' : 'Non lues'} : {result.data.unreadCount}
          </p>
          <section className="seller-order-list">
            {result.data.items.length === 0 && (
              <p>{ar ? 'لا توجد إشعارات لعرضها.' : 'Aucune notification à afficher.'}</p>
            )}
            {result.data.items.map((item) => (
              <article className="seller-order-card" key={`${item.sellerOrderId}:${item.version}`}>
                <span className="badge">
                  {item.readAt ? (ar ? 'مقروءة' : 'Lue') : ar ? 'جديدة' : 'Nouvelle'}
                </span>
                <h2>{orderCopy[locale][item.status]}</h2>
                <p className="mono">{item.sellerOrderId}</p>
                <p>
                  <time dateTime={item.occurredAt}>{orderDate(item.occurredAt, locale)}</time>
                </p>
                <p>
                  <Link href={href(`/orders/${item.sellerOrderId}`, locale)}>
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
          </section>
          {result.data.nextCursor && (
            <Link
              className="button secondary"
              href={`${href('/notifications', locale)}&cursor=${encodeURIComponent(result.data.nextCursor)}`}
            >
              {ar ? 'إشعارات أقدم' : 'Notifications plus anciennes'}
            </Link>
          )}
        </>
      ) : (
        <ServiceState error={result.error} locale={locale} retryPath="/notifications" />
      )}
    </Shell>
  );
}
