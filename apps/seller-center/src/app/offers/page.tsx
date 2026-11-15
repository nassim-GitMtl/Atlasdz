import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { listOffers, listOfferProducts } from '@/lib/api';
import { copy, href, localeFrom, money, type SearchParams, localized, lang, intlLocale } from '@/lib/i18n';
import { localAccountsEnabled } from '@/lib/security';
import { accessToken } from '@/lib/session';

export default async function Offers({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = localeFrom(params.lang);
  const t = copy[locale];
  const token = await accessToken();
  if (!token) redirect(href('/', locale));
  const local = localAccountsEnabled(process.env, (await headers()).get('host'));
  const result = await Promise.all([listOffers(token), listOfferProducts(token)])
    .then(([offers, products]) => ({
      offers: offers.items,
      products: products.items,
      error: undefined,
    }))
    .catch((error: unknown) => ({ offers: [], products: [], error }));
  return (
    <Shell locale={locale} currentPath="/offers" signedIn local={local}>
      {result.error ? (
        <ServiceState error={result.error} locale={locale} retryPath="/offers" />
      ) : (
        <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">{t.workspace}</span>
              <h1>{t.offerTitle}</h1>
              <p>{t.offerBody}</p>
            </div>
            <Link className="button" href={href('/offers/new', locale)}>
              <span aria-hidden="true">＋</span>
              {t.newOffer}
            </Link>
          </div>
          {params.created === '1' && (
            <p role="status" className="notice success">
              {t.submitted}
            </p>
          )}
          {params.updated === '1' && (
            <p role="status" className="notice success">
              {t.updatedOffer}
            </p>
          )}
          <div className="stats">
            <div className="stat">
              <span>{t.total}</span>
              <strong>{result.offers.length}</strong>
            </div>
            <div className="stat">
              <span>{t.live}</span>
              <strong>{result.offers.filter((offer) => offer.status === 'APPROVED').length}</strong>
            </div>
            <div className="stat">
              <span>{t.pending}</span>
              <strong>
                {result.offers.filter((offer) => offer.status === 'PENDING_REVIEW').length}
              </strong>
            </div>
          </div>
          <section className="offers-panel">
            <div className="panel-heading">
              <h2>{t.offers}</h2>
              <span className="count-pill">{result.offers.length}</span>
            </div>
            {result.offers.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon" aria-hidden="true">
                  ＋
                </span>
                <h2>{t.empty}</h2>
                <p>{t.emptyBody}</p>
                <Link className="button" href={href('/offers/new', locale)}>
                  {t.newOffer}
                </Link>
              </div>
            ) : (
              <div className="offer-list">
                {result.offers.map((offer) => {
                  const product = result.products.find((item) => item.id === offer.productId);
                  return (
                    <article className="offer-row" key={offer.id}>
                      <div className="product-marker" aria-hidden="true">
                        {localized(product?.title, locale)?.slice(0, 1) ?? 'A'}
                      </div>
                      <div className="offer-identity">
                        <h3>{localized(product?.title, locale) ?? offer.productId}</h3>
                        <span className={`badge ${offer.status === 'APPROVED' ? 'approved' : offer.status === 'REJECTED' ? 'badge--bad' : ''}`}>
                          {t[offer.status]}
                        </span>
                        {offer.promotion && (
                          <small className="promo-note">
                            {lang(locale, 'Promotion : ', 'تخفيض: ', 'Sale: ')}
                            {money(offer.promotion.priceMinor, locale)} ·{' '}
                            {new Date(offer.promotion.endsAt).toLocaleDateString(intlLocale(locale), { timeZone: 'Africa/Algiers' })}
                          </small>
                        )}
                        {offer.status === 'REJECTED' && offer.rejectionReason && (
                          <small className="reject-reason">{offer.rejectionReason}</small>
                        )}
                        <small className="mono">{offer.id}</small>
                        <Link href={href(`/offers/${offer.id}`, locale)}>{t.editOffer}</Link>
                      </div>
                      <dl className="offer-numbers">
                        <div>
                          <dt>{t.price}</dt>
                          <dd>{money(offer.priceMinor, locale)}</dd>
                        </div>
                        <div>
                          <dt>{t.stock}</dt>
                          <dd>
                            {offer.availableQuantity} <small>{t.units}</small>
                          </dd>
                        </div>
                        <div>
                          <dt>{t.handling}</dt>
                          <dd>
                            {offer.handlingDays} <small>{t.days}</small>
                            {offer.preorder && (
                              <small className="badge">
                                {t.preorder} · {offer.preorder.minDays}–{offer.preorder.maxDays}{' '}
                                {t.days}
                              </small>
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>{t.delivery}</dt>
                          <dd>
                            {offer.deliveryFeeMinor
                              ? money(offer.deliveryFeeMinor, locale)
                              : t.free}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}
