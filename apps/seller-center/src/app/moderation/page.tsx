import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApproveForm } from '@/components/forms';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { listPendingOffers, listProducts, listReviewProducts } from '@/lib/api';
import { copy, href, localeFrom, money, type SearchParams } from '@/lib/i18n';
import { localAccountsEnabled } from '@/lib/security';
import { accessToken } from '@/lib/session';

export default async function Moderation({
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
  const result = await Promise.all([
    listPendingOffers(token),
    listProducts(),
    listReviewProducts(token),
  ])
    .then(([offers, products, entries]) => ({
      offers: offers.items,
      products: products.items,
      entries: entries.items,
      error: undefined,
    }))
    .catch((error: unknown) => ({ offers: [], products: [], entries: [], error }));
  return (
    <Shell locale={locale} currentPath="/moderation" signedIn local={local}>
      {result.error ? (
        <ServiceState error={result.error} locale={locale} retryPath="/moderation" />
      ) : (
        <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">ATLAS DZ · {t.moderation}</span>
              <h1>{t.review}</h1>
              <p>{t.reviewBody}</p>
            </div>
            <span className="large-count">{result.offers.length}</span>
          </div>
          {params.approved === '1' && (
            <p role="status" className="notice success">
              {t.approved}
            </p>
          )}
          {result.offers.length === 0 ? (
            <section className="empty-state offers-panel">
              <span className="empty-icon" aria-hidden="true">
                ✓
              </span>
              <h2>{t.noReview}</h2>
            </section>
          ) : (
            <div className="review-grid">
              {result.offers.map((offer) => {
                const product = result.entries.find((item) => item.id === offer.productId);
                const seller = result.products
                  .flatMap((item) => item.offers)
                  .find((item) => item.seller.id === offer.sellerId)?.seller;
                return (
                  <article className="review-card" key={offer.id}>
                    <div className="review-card-top">
                      <span className="badge">{t.PENDING_REVIEW}</span>
                      <span className="product-marker" aria-hidden="true">
                        {product?.title[locale].slice(0, 1) ?? 'A'}
                      </span>
                    </div>
                    <h2>{product?.title[locale] ?? offer.productId}</h2>
                    <p className="seller-name">
                      {t.seller}: {seller?.name ?? offer.sellerId}
                    </p>
                    <dl className="review-details">
                      <div>
                        <dt>{t.price}</dt>
                        <dd>{money(offer.priceMinor, locale)}</dd>
                      </div>
                      <div>
                        <dt>{t.quantity}</dt>
                        <dd>{offer.availableQuantity}</dd>
                      </div>
                      <div>
                        <dt>{t.handling}</dt>
                        <dd>{offer.handlingDays}</dd>
                      </div>
                      <div>
                        <dt>{t.delivery}</dt>
                        <dd>{money(offer.deliveryFeeMinor, locale)}</dd>
                      </div>
                    </dl>
                    <small className="mono">{offer.id}</small>
                    <ApproveForm locale={locale} offerId={offer.id} />
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
