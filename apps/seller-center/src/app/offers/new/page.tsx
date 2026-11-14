import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { OfferForm } from '@/components/forms';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { listOffers, listOfferProducts } from '@/lib/api';
import { productsCopy } from '@/lib/products-copy';
import { copy, href, localeFrom, type SearchParams } from '@/lib/i18n';
import { localAccountsEnabled } from '@/lib/security';
import { accessToken } from '@/lib/session';

export default async function NewOffer({
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
  const result = await Promise.all([listOfferProducts(token), listOffers(token)])
    .then(([products]) => ({ products: products.items, error: undefined }))
    .catch((error: unknown) => ({ products: [], error }));
  return (
    <Shell locale={locale} currentPath="/offers/new" signedIn local={local}>
      <Link className="back-link" href={href('/offers', locale)}>
        <span aria-hidden="true">←</span>
        {t.back}
      </Link>
      {result.error ? (
        <ServiceState error={result.error} locale={locale} retryPath="/offers/new" />
      ) : (
        <>
          <div className="page-heading">
            <div>
              <span className="eyebrow">{t.newOffer}</span>
              <h1>{t.createTitle}</h1>
              <p>{t.createBody}</p>
            </div>
          </div>
          <section className="form-panel">
            <Link href={href('/products', locale)}>{productsCopy[locale].newProduct}</Link>
            <OfferForm
              products={result.products}
              locale={locale}
              preselectedProductId={
                result.products.find((p) => p.id === params.productId)?.id ?? ''
              }
            />
          </section>
        </>
      )}
    </Shell>
  );
}
