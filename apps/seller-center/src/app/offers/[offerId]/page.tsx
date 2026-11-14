import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { UuidSchema } from '@atlas/contracts';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { OfferForm } from '@/components/forms';
import { getOffer } from '@/lib/api';
import { copy, href, localeFrom, type SearchParams } from '@/lib/i18n';
import { localAccountsEnabled } from '@/lib/security';
import { accessToken } from '@/lib/session';

export default async function EditOffer({
  params,
  searchParams,
}: {
  readonly params: Promise<{ offerId: string }>;
  readonly searchParams: Promise<SearchParams>;
}) {
  const { offerId } = await params;
  if (!UuidSchema.safeParse(offerId).success) notFound();
  const locale = localeFrom((await searchParams).lang);
  const t = copy[locale];
  const token = await accessToken();
  if (!token) redirect(href('/', locale));
  const local = localAccountsEnabled(process.env, (await headers()).get('host'));
  const result = await getOffer(token, offerId)
    .then((offer) => ({ offer, error: undefined }))
    .catch((error: unknown) => ({ offer: undefined, error }));
  return (
    <Shell locale={locale} currentPath={`/offers/${offerId}`} signedIn local={local}>
      <Link href={href('/offers', locale)}>{t.back}</Link>
      <h1>{t.editOffer}</h1>
      {result.offer ? (
        <section className="form-panel">
          <p className="mono">{result.offer.id}</p>
          <p>{t[result.offer.status]}</p>
          {['PENDING_REVIEW', 'APPROVED'].includes(result.offer.status) ? (
            <OfferForm
              key={result.offer.rowVersion}
              offer={result.offer}
              locale={locale}
              products={[]}
            />
          ) : (
            <p role="status">{t.offerLocked}</p>
          )}
        </section>
      ) : (
        <ServiceState error={result.error} locale={locale} retryPath={`/offers/${offerId}`} />
      )}
    </Shell>
  );
}
