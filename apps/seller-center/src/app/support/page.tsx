import { liveCheckoutEnabled } from '@/lib/orders-copy';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { UuidSchema } from '@atlas/contracts';
import { Shell } from '@/components/shell';
import { SupportForm } from '@/components/support-form';
import { accessToken, accountKind } from '@/lib/session';
import { localAccountsEnabled } from '@/lib/security';
import { getSupport, getOrderSupport, listSupport } from '@/lib/api';
import { supportCopy } from '@/lib/support-copy';
import { orderDate } from '@/lib/orders-copy';
import { href, localeFrom, type SearchParams } from '@/lib/i18n';
/** Open: needs an answer; escalated: needs staff; waiting or resolved: nothing to do now. */
function caseTone(status: string): 'action' | 'bad' | 'wait' | 'good' {
  if (status === 'OPEN') return 'action';
  if (status === 'ESCALATED') return 'bad';
  if (status === 'RESOLVED') return 'good';
  return 'wait';
}

export default async function Support({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const locale = localeFrom(query.lang);
  const t = supportCopy[locale];
  const token = await accessToken();
  if (!token) redirect(href('/', locale));
  const local = localAccountsEnabled(process.env, (await headers()).get('host'));
  // Staff open on escalations; anyone can switch with the tabs (the API decides access).
  const staff = query.staff === '1' || (query.staff === undefined && (await accountKind()) === 'staff');
  const base = `${href('/support', locale)}&staff=${staff ? '1' : '0'}`;
  const caseId = typeof query.caseId === 'string' ? query.caseId : undefined;
  const orderId = typeof query.sellerOrderId === 'string' ? query.sellerOrderId : undefined;
  const result = await (async () => {
    if (caseId)
      return {
        detail: await getSupport(
          token,
          UuidSchema.parse(caseId),
          staff,
          typeof query.before === 'string' ? query.before : undefined,
        ),
        list: null,
      };
    if (orderId && !staff)
      return { detail: await getOrderSupport(token, UuidSchema.parse(orderId)), list: null };
    return {
      detail: null,
      list: await listSupport(
        token,
        staff,
        typeof query.cursor === 'string' ? query.cursor : undefined,
      ),
    };
  })()
    .then((data) => ({ ...data, error: undefined }))
    .catch((error: unknown) => ({ detail: null, list: null, error }));
  const item = result.detail?.case;
  return (
    <Shell locale={locale} currentPath="/support" signedIn local={local}>
      <h1>{staff ? t.staff : t.title}</h1>
      <p className="notice">{liveCheckoutEnabled() ? t.liveNotice : t.notice}</p>
      <nav className="tabs" aria-label={t.title}>
        <Link href={`${href('/support', locale)}&staff=0`} aria-current={staff ? undefined : 'page'}>
          {t.seller}
        </Link>
        <Link href={`${href('/support', locale)}&staff=1`} aria-current={staff ? 'page' : undefined}>
          {t.staff}
        </Link>
      </nav>
      {result.error ? (
        <div role="alert" className="alert-box">
          <p>{t.loadError}</p>
          <div className="alert-actions">
            <a className="button secondary small" href={base}>
              {t.refresh}
            </a>
            <Link className="button secondary small" href={href('/login', locale)}>
              {locale === 'ar' ? 'تسجيل الدخول' : 'Se connecter'}
            </Link>
          </div>
        </div>
      ) : item && result.detail ? (
        <article className="seller-order-card">
          <h2>
            {item.sellerName} · {t[item.category]}
          </h2>
          <p role="status">{t[item.status]}</p>
          {staff ? (
            <p className="mono">{item.sellerOrderId}</p>
          ) : (
            <Link href={href(`/orders/${item.sellerOrderId}`, locale)}>{item.sellerOrderId}</Link>
          )}
          <p>
            <a href={`${base}&caseId=${item.id}`}>{t.refresh}</a>
          </p>
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
          {item.status !== 'RESOLVED' && (!staff || item.status === 'ESCALATED') && (
            <SupportForm
              key={item.version}
              locale={locale}
              item={item}
              staff={staff}
              requestId={randomUUID()}
            />
          )}
        </article>
      ) : (
        <section className="seller-order-list">
          {result.list?.items.length ? (
            result.list.items.map((c) => (
              <article className="seller-order-card" key={c.id}>
                <div className="order-row__head">
                  <h2>
                    <Link href={`${base}&caseId=${c.id}`}>
                      {c.sellerName} · {t[c.category]}
                    </Link>
                  </h2>
                  <span className={`badge badge--${caseTone(c.status)}`}>{t[c.status]}</span>
                </div>
              </article>
            ))
          ) : (
            <p className="panel-empty">{t.empty}</p>
          )}
          {result.list?.nextCursor && (
            <Link href={`${base}&cursor=${encodeURIComponent(result.list.nextCursor)}`}>
              {t.more}
            </Link>
          )}
        </section>
      )}
    </Shell>
  );
}
