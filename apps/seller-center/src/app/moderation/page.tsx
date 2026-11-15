import { fill } from '@/lib/dashboard-copy';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApproveForm, RejectOfferForm } from '@/components/forms';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { listPendingOffers, listProducts, listReviewProducts } from '@/lib/api';
import { copy, href, localeFrom, money, type SearchParams } from '@/lib/i18n';
import { localAccountsEnabled } from '@/lib/security';
import { accessToken } from '@/lib/session';

const queueCopy = {
  fr: {
    pending: '{n} en attente',
    rejected: 'Offre refusée. Le vendeur a reçu le motif par e-mail et peut la corriger.',
    product: 'Produit',
    price: 'Prix',
    stock: 'Stock',
    terms: 'Délai',
    action: 'Décision',
    handling: 'En stock · préparation {n} j',
    preorder: 'Pré-commande · {min}–{max} j',
    note: 'Valider rend l’offre visible sur la fiche produit. Le vendeur reste responsable de l’envoi et de l’encaissement à la livraison.',
  },
  ar: {
    pending: '{n} قيد الانتظار',
    rejected: 'تم رفض العرض. تلقى البائع السبب بالبريد ويمكنه تعديله.',
    product: 'المنتج',
    price: 'السعر',
    stock: 'المخزون',
    terms: 'المهلة',
    action: 'القرار',
    handling: 'متوفر · تحضير {n} يوم',
    preorder: 'طلب مسبق · {min}–{max} يوم',
    note: 'الموافقة تجعل العرض ظاهرًا في صفحة المنتج. يبقى البائع مسؤولًا عن الشحن والتحصيل عند الاستلام.',
  },
} as const;

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
  const q = queueCopy[locale];
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
          {params.rejected === '1' && (
            <p role="status" className="notice">
              {q.rejected}
            </p>
          )}
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
            <section className="panel" aria-labelledby="queue-title">
              <div className="panel-head">
                <h2 id="queue-title">{t.review}</h2>
                <span>{fill(q.pending, { n: result.offers.length })}</span>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">{q.product}</th>
                      <th scope="col">{t.seller}</th>
                      <th scope="col" className="num">{q.price}</th>
                      <th scope="col" className="num">{q.stock}</th>
                      <th scope="col">{q.terms}</th>
                      <th scope="col"><span className="sr-only">{q.action}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.offers.map((offer) => {
                      const product = result.entries.find((item) => item.id === offer.productId);
                      const seller = result.products
                        .flatMap((item) => item.offers)
                        .find((item) => item.seller.id === offer.sellerId)?.seller;
                      return (
                        <tr key={offer.id}>
                          <td>
                            <strong>{product?.title[locale] ?? offer.productId}</strong>
                            <small className="mono row-ref" title={offer.id}>
                              {offer.id.slice(0, 8)}
                            </small>
                          </td>
                          <td>{seller?.name ?? offer.sellerId}</td>
                          <td className="num strong">
                            <bdi>{money(offer.priceMinor, locale)}</bdi>
                          </td>
                          <td className="num">{offer.availableQuantity}</td>
                          <td>
                            {offer.preorder
                              ? fill(q.preorder, { min: offer.preorder.minDays, max: offer.preorder.maxDays })
                              : fill(q.handling, { n: offer.handlingDays })}
                          </td>
                          <td className="end">
                            <div className="decision">
                              <ApproveForm locale={locale} offerId={offer.id} />
                              <RejectOfferForm locale={locale} offerId={offer.id} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="panel-note">{q.note}</p>
            </section>
          )}
        </>
      )}
    </Shell>
  );
}
