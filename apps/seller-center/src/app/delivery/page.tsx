import { liveCheckoutEnabled } from '@/lib/orders-copy';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { DeliveryRateForm } from '@/components/delivery-rate-form';
import { listDeliveryDestinations, listDeliveryRates } from '@/lib/api';
import { href, localeFrom, type SearchParams, localized, intlLocale } from '@/lib/i18n';
import { deliveryCopy } from '@/lib/delivery-copy';
import { localAccountsEnabled } from '@/lib/security';
import { accessToken } from '@/lib/session';
import type { DeliveryDestination } from '@atlas/contracts';
export default async function Delivery({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = localeFrom(params.lang);
  const t = deliveryCopy[locale];
  const token = await accessToken();
  if (!token) redirect(href('/', locale));
  const local = localAccountsEnabled(process.env, (await headers()).get('host'));
  const result = await Promise.all([listDeliveryDestinations(token), listDeliveryRates(token)])
    .then(([destinations, rates]) => ({
      destinations: destinations.items,
      rates: rates.items,
      error: undefined,
    }))
    .catch((error: unknown) => ({ destinations: undefined, rates: undefined, error }));
  const wilayas = [
    ...new Map(
      (result.destinations ?? []).flatMap((d) =>
        d.wilaya ? [[d.wilaya.id, d.wilaya] as const] : [],
      ),
    ).values(),
  ];
  const selected =
    typeof params.wilaya === 'string' &&
    (params.wilaya === 'test' || wilayas.some((w) => w.id === params.wilaya))
      ? params.wilaya
      : (wilayas[0]?.id ?? 'test');
  const wilaya = wilayas.find((w) => w.id === selected);
  const destinations = (result.destinations ?? []).filter((d) =>
    wilaya ? d.wilaya?.id === wilaya.id : !d.wilaya,
  );
  const query = typeof params.q === 'string' ? params.q.slice(0, 100).trim() : '';
  const normalize = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  const shown = destinations.filter((d) =>
    normalize(`${d.name.fr} ${d.name.ar}`).includes(normalize(query)),
  );
  const baseRate = result.rates?.find((r) => r.destination.id === wilaya?.id);
  const baseDestination: DeliveryDestination | undefined =
    wilaya && destinations[0]
      ? {
          ...wilaya,
          datasetVersionId: destinations[0].datasetVersionId,
          dataClass: 'reference',
          kind: 'WILAYA',
        }
      : undefined;
  return (
    <Shell locale={locale} currentPath="/delivery" signedIn local={local}>
      <div className="page-heading">
        <div>
          <h1>{t.title}</h1>
          <p>{t.body}</p>
        </div>
      </div>
      <p className="notice">{liveCheckoutEnabled() ? t.liveNotice : t.notice}</p>
      {result.destinations ? (
        <section className="seller-order-list">
          {result.destinations.length === 0 && <p role="status">{t.missing}</p>}
          <form method="get" className="delivery-filter">
            <input type="hidden" name="lang" value={locale} />
            <label htmlFor="delivery-wilaya">{t.wilaya}</label>
            <select id="delivery-wilaya" name="wilaya" defaultValue={selected}>
              {wilayas.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {localized(w.name, locale)}
                </option>
              ))}
              {result.destinations.some((d) => !d.wilaya) && (
                <option value="test">{t.testLocations}</option>
              )}
            </select>
            <label htmlFor="delivery-search">{t.search}</label>
            <input
              id="delivery-search"
              name="q"
              type="search"
              maxLength={100}
              defaultValue={query}
            />
            <button className="button" type="submit">
              {t.show}
            </button>
          </form>
          <p>
            {wilayas.length} {t.wilayas} · {result.destinations.filter((d) => d.wilaya).length}{' '}
            {t.communes}
          </p>
          {baseDestination && (
            <article className="seller-order-card">
              <h2>
                {localized(baseDestination.name, locale)} — {t.baseRate}
              </h2>
              <p>{t.baseHint}</p>
              <DeliveryRateForm
                key={baseDestination.id}
                destination={baseDestination}
                rate={baseRate}
                locale={locale}
              />
            </article>
          )}
          <h2>{t.communeRates}</h2>
          <p>{t.overrideHint}</p>
          {shown.length === 0 && <p role="status">{t.noResults}</p>}
          {shown.map((destination) => {
            const rate = result.rates.find((r) => r.destination.id === destination.id);
            const inherited = Boolean(destination.wilaya && (!rate || rate.useWilayaRate));
            const effective = inherited ? baseRate : rate;
            return (
              <article className="seller-order-card" key={destination.id}>
                <h3>{localized(destination.name, locale)}</h3>
                <p className="badge">
                  {effective?.enabled ? t.active : t.inactive} ·{' '}
                  {inherited ? t.inherited : t.custom}
                </p>
                {effective?.enabled && (
                  <p>
                    {new Intl.NumberFormat(intlLocale(locale), {
                      style: 'currency',
                      currency: 'DZD',
                    }).format(effective.shippingFeeMinor / 100)}
                    {effective.deliveryDays &&
                      ` · ${t.daysShort(effective.deliveryDays.min, effective.deliveryDays.max)}`}
                  </p>
                )}
                <details>
                  <summary>{t.configure}</summary>
                  <DeliveryRateForm
                    key={destination.id}
                    destination={destination}
                    rate={rate}
                    locale={locale}
                  />
                </details>
              </article>
            );
          })}
        </section>
      ) : (
        <ServiceState error={result.error} locale={locale} retryPath="/delivery" />
      )}
    </Shell>
  );
}
