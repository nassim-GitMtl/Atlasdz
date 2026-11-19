import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { QuickEditForm } from '@/components/quick-edit-form';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { listOffers, listOfferProducts } from '@/lib/api';
import { href, lang, localeFrom, localized, money, type SearchParams } from '@/lib/i18n';
import { localAccountsEnabled } from '@/lib/security';
import { accessToken } from '@/lib/session';

/** Centimes as the dinars a seller types: "1500" or "1500.50". */
const dinars = (minor: number) =>
  minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);

export default async function QuickOffers({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = localeFrom(params.lang);
  const token = await accessToken();
  if (!token) redirect(href('/', locale));
  const local = localAccountsEnabled(process.env, (await headers()).get('host'));
  const result = await Promise.all([listOffers(token), listOfferProducts(token)])
    .then(([offers, products]) => ({ offers: offers.items, products: products.items, error: undefined }))
    .catch((error: unknown) => ({ offers: [], products: [], error }));
  // Live and pending offers; refused or suspended ones are corrected from their own page.
  const editable = result.offers.filter(
    (offer) => offer.status === 'APPROVED' || offer.status === 'PENDING_REVIEW',
  );
  return (
    <Shell locale={locale} currentPath="/offers" signedIn local={local}>
      {result.error ? (
        <ServiceState error={result.error} locale={locale} retryPath="/offers/quick" />
      ) : (
        <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">{lang(locale, 'Offres', 'العروض', 'Offers')}</span>
              <h1>{lang(locale, 'Mise à jour rapide', 'تحديث سريع', 'Quick update')}</h1>
              <p>
                {lang(
                  locale,
                  'Changez le prix et le stock de plusieurs offres, puis enregistrez une seule fois. Délai, précommande et promotion restent inchangés.',
                  'غيّر السعر والمخزون لعدة عروض ثم احفظ مرة واحدة. تبقى مدة التحضير والطلب المسبق والتخفيض كما هي.',
                  'Change the price and stock of several offers, then save once. Handling time, pre-order and sale stay as they are.',
                )}
              </p>
            </div>
            <Link className="button secondary" href={href('/offers', locale)}>
              {lang(locale, 'Retour aux offres', 'العودة إلى العروض', 'Back to offers')}
            </Link>
          </div>
          {editable.length === 0 ? (
            <p className="notice">
              {lang(locale, 'Aucune offre à mettre à jour.', 'لا توجد عروض للتحديث.', 'No offers to update.')}
            </p>
          ) : (
            <QuickEditForm
              locale={locale}
              offers={editable.map((offer) => ({
                id: offer.id,
                title:
                  localized(result.products.find((item) => item.id === offer.productId)?.title, locale) ??
                  offer.productId,
                version: offer.rowVersion,
                price: dinars(offer.priceMinor),
                stock: String(offer.availableQuantity),
                note:
                  [
                    offer.promotion
                      ? `${lang(locale, 'Promotion', 'تخفيض', 'Sale')} : ${money(offer.promotion.priceMinor, locale)}`
                      : null,
                    offer.status === 'PENDING_REVIEW'
                      ? lang(locale, 'En vérification', 'قيد المراجعة', 'Under review')
                      : null,
                    offer.waitingCustomers
                      ? lang(
                          locale,
                          `${offer.waitingCustomers} client(s) en attente du retour en stock`,
                          `${offer.waitingCustomers} زبون ينتظر عودته إلى المخزون`,
                          `${offer.waitingCustomers} customer(s) waiting for it to be back`,
                        )
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined,
              }))}
            />
          )}
        </>
      )}
    </Shell>
  );
}
