import { liveCheckoutEnabled } from '@/lib/orders-copy';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { UuidSchema } from '@atlas/contracts';
import { SiteChrome } from '@/components/site-chrome';
import { SupportForm } from '@/components/support-form';
import { customerToken } from '@/lib/cart-api';
import { getSupport, getOrderSupport, listSupport } from '@/lib/orders-api';
import { supportCopy } from '@/lib/support-copy';
import { orderDate } from '@/lib/orders-copy';
import { localizedHref, type SearchParams, resolveLocale } from '@/lib/i18n';

export default async function Support({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const locale = resolveLocale(query.lang);
  const t = supportCopy[locale];
  const token = await customerToken();
  if (!token) redirect(localizedHref('/login', locale));
  const base = localizedHref('/support', locale);
  const caseId = typeof query.caseId === 'string' ? query.caseId : undefined;
  const orderId = typeof query.sellerOrderId === 'string' ? query.sellerOrderId : undefined;
  const result = await (async () => {
    if (caseId)
      return {
        detail: await getSupport(
          token,
          UuidSchema.parse(caseId),
          typeof query.before === 'string' ? query.before : undefined,
        ),
        list: null,
      };
    if (orderId)
      return { detail: await getOrderSupport(token, UuidSchema.parse(orderId)), list: null };
    return {
      detail: null,
      list: await listSupport(token, typeof query.cursor === 'string' ? query.cursor : undefined),
    };
  })()
    .then((data) => ({ ...data, error: false }))
    .catch(() => ({ detail: null, list: null, error: true }));
  const item = result.detail?.case;
  return (
    <SiteChrome locale={locale} pathname="/support" searchParams={query}>
      <section className="page-container order-page">
        <h1>{t.title}</h1>
        <p className="cart-notice">{liveCheckoutEnabled() ? t.liveNotice : t.notice}</p>
        <Link href={localizedHref('/orders', locale)}>{t.orders}</Link>
        {' · '}
        <Link href={base}>{t.title}</Link>
        {result.error ? (
          <div role="alert">
            <p>{t.loadError}</p>
            <a href={base}>{t.refresh}</a>
          </div>
        ) : item && result.detail ? (
          <article className="order-card">
            <h2>
              {item.sellerName} · {t[item.category]}
            </h2>
            <p role="status">{t[item.status]}</p>
            <a href={`${base}&caseId=${item.id}`}>{t.refresh}</a>
            {result.detail.nextBeforeVersion && (
              <p>
                <Link href={`${base}&caseId=${item.id}&before=${result.detail.nextBeforeVersion}`}>
                  {t.older}
                </Link>
              </p>
            )}
            <ol className="order-history">
              {result.detail.messages.map((m) => (
                <li key={m.version}>
                  <strong>{t[m.attribution]}</strong> ·{' '}
                  <time dateTime={m.createdAt}>{orderDate(m.createdAt, locale)}</time>
                  <p className="support-message">{m.body}</p>
                </li>
              ))}
            </ol>
            <SupportForm key={item.version} locale={locale} item={item} requestId={randomUUID()} />
          </article>
        ) : orderId ? (
          <article className="order-card">
            <h2>{t.create}</h2>
            <p className="order-id">{orderId}</p>
            <SupportForm locale={locale} sellerOrderId={orderId} requestId={randomUUID()} />
          </article>
        ) : (
          <div className="order-groups">
            {result.list?.items.length ? (
              result.list.items.map((c) => (
                <article className="order-card" key={c.id}>
                  <Link href={`${base}&caseId=${c.id}`}>
                    {c.sellerName} · {t[c.category]}
                  </Link>
                  <p>{t[c.status]}</p>
                </article>
              ))
            ) : (
              <p>{t.empty}</p>
            )}
            {result.list?.nextCursor && (
              <Link href={`${base}&cursor=${encodeURIComponent(result.list.nextCursor)}`}>
                {t.more}
              </Link>
            )}
          </div>
        )}
      </section>
    </SiteChrome>
  );
}
