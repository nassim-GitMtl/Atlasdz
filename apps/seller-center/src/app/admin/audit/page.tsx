import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { auditLog } from '@/lib/admin';
import { href, lang, localeFrom, type SearchParams } from '@/lib/i18n';
import { orderDate } from '@/lib/orders-copy';
import { accessToken } from '@/lib/session';

const AREAS = ['identity', 'product', 'offer', 'seller', 'seller_order', 'review', 'support', 'catalog', 'order'] as const;
const ACTORS = ['staff', 'seller_user', 'customer', 'service'] as const;
const param = (value: string | string[] | undefined) => (typeof value === 'string' ? value.trim() : '');

/** Staff accountability: who did what, when, on which record (newest first). */
export default async function AdminAudit({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const locale = localeFrom(query.lang);
  const token = await accessToken();
  if (!token) redirect(href('/login', locale));
  const filters = {
    area: (AREAS as readonly string[]).includes(param(query.area)) ? param(query.area) : '',
    actor: (ACTORS as readonly string[]).includes(param(query.actor)) ? param(query.actor) : '',
    entity: /^[0-9a-f-]{36}$/.test(param(query.entity)) ? param(query.entity) : '',
  };
  const result = await auditLog(token, {
    ...filters,
    beforeAt: param(query.beforeAt),
    beforeId: param(query.beforeId),
  })
    .then((data) => ({ data, error: undefined }))
    .catch((error: unknown) => ({ data: undefined, error }));
  const actorLabel = (type: string) =>
    ({
      staff: lang(locale, 'Équipe', 'الفريق', 'Staff'),
      seller_user: lang(locale, 'Vendeur', 'بائع', 'Seller'),
      customer: lang(locale, 'Client', 'زبون', 'Customer'),
      service: lang(locale, 'Système', 'النظام', 'System'),
    })[type] ?? type;
  const filterQuery = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
  return (
    <Shell locale={locale} currentPath="/admin/audit" signedIn>
      <div className="page-heading">
        <div>
          <h1>{lang(locale, 'Journal d’audit', 'سجل التدقيق', 'Audit log')}</h1>
          <p>
            {lang(
              locale,
              'Qui a fait quoi, quand et sur quel enregistrement. Le journal ne peut pas être modifié.',
              'من فعل ماذا ومتى وعلى أي سجل. لا يمكن تعديل السجل.',
              'Who did what, when, on which record. The log cannot be changed.',
            )}
          </p>
        </div>
      </div>
      <form className="panel panel--pad audit-filters" action="/admin/audit" method="get" role="search">
        <input type="hidden" name="lang" value={locale} />
        <label>
          <span>{lang(locale, 'Domaine', 'المجال', 'Area')}</span>
          <select name="area" defaultValue={filters.area}>
            <option value="">{lang(locale, 'Tous', 'الكل', 'All')}</option>
            {AREAS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{lang(locale, 'Auteur', 'المنفّذ', 'Actor')}</span>
          <select name="actor" defaultValue={filters.actor}>
            <option value="">{lang(locale, 'Tous', 'الكل', 'All')}</option>
            {ACTORS.map((actor) => (
              <option key={actor} value={actor}>
                {actorLabel(actor)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{lang(locale, 'Identifiant (enregistrement ou auteur)', 'المعرّف (سجل أو منفّذ)', 'Identifier (record or actor)')}</span>
          <input name="entity" dir="ltr" maxLength={36} defaultValue={filters.entity} />
        </label>
        <button className="button small" type="submit">
          {lang(locale, 'Filtrer', 'تصفية', 'Filter')}
        </button>
      </form>
      {result.data ? (
        <section className="panel" aria-live="polite">
          {result.data.items.length === 0 ? (
            <p className="panel-empty">{lang(locale, 'Aucun événement.', 'لا توجد أحداث.', 'No events.')}</p>
          ) : (
            <ul className="plain-list panel-list audit-list">
              {result.data.items.map((event) => (
                <li key={event.id}>
                  <span>
                    <strong className="audit-action">{event.action}</strong>
                    {event.outcome !== 'SUCCEEDED' && <span className="badge badge--bad">{event.outcome}</span>}
                    <small>
                      {orderDate(event.occurredAt, locale)} · {actorLabel(event.actorType)}
                      {event.actorEmail ? ` (${event.actorEmail})` : ''} · {event.entityType}
                      {event.entityId ? (
                        <>
                          {' '}
                          <Link className="mono" href={`${href('/admin/audit', locale)}&entity=${event.entityId}`}>
                            {event.entityId.slice(0, 8)}
                          </Link>
                        </>
                      ) : null}
                    </small>
                    {event.reason && <small>{event.reason}</small>}
                    {event.details && (
                      <details>
                        <summary>{lang(locale, 'Détails', 'التفاصيل', 'Details')}</summary>
                        <code className="audit-details">{event.details}</code>
                      </details>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {result.data.next && (
            <p>
              <Link
                className="button secondary small"
                href={`${href('/admin/audit', locale)}&${new URLSearchParams({
                  ...filterQuery,
                  beforeAt: result.data.next.at,
                  beforeId: result.data.next.id,
                }).toString()}`}
              >
                {lang(locale, 'Événements plus anciens', 'أحداث أقدم', 'Older events')}
              </Link>
            </p>
          )}
        </section>
      ) : (
        <ServiceState error={result.error} locale={locale} retryPath="/admin/audit" />
      )}
    </Shell>
  );
}
