import { redirect } from 'next/navigation';
import { SellerReviewForm } from '@/components/auth-forms';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { listSellerApplications } from '@/lib/auth';
import { authCopy } from '@/lib/auth-copy';
import { href, localeFrom, type SearchParams, intlLocale } from '@/lib/i18n';
import { accessToken } from '@/lib/session';

export default async function SellerApplications({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const locale = localeFrom(params.lang);
  const t = authCopy[locale];
  const token = await accessToken();
  if (!token) redirect(href('/login', locale));
  const result = await listSellerApplications(token).catch((error: unknown) => ({ error }));
  return (
    <Shell locale={locale} currentPath="/moderation/sellers" signedIn>
      {'error' in result ? (
        <ServiceState error={result.error} locale={locale} retryPath="/moderation/sellers" />
      ) : (
        <>
          <div className="page-heading">
            <div>
              <h1>{t.sellersTitle}</h1>
              <p>{t.sellersBody}</p>
            </div>
            <span className="large-count">{result.items.length}</span>
          </div>
          {params.reviewed === '1' && (
            <p role="status" className="notice success">
              {t.reviewed}
            </p>
          )}
          {result.items.length === 0 ? (
            <section className="empty-state offers-panel">
              <h2>{t.noSellers}</h2>
            </section>
          ) : (
            <ul className="seller-applications">
              {result.items.map((seller) => (
                <li key={seller.sellerId} className="offers-panel">
                  <h2>{seller.name}</h2>
                  <p dir="ltr">
                    {seller.email} · /{seller.slug} ·{' '}
                    {new Date(seller.createdAt).toLocaleDateString(
                      intlLocale(locale),
                    )}
                  </p>
                  <p lang="fr" dir="ltr">
                    {seller.descriptionFr}
                  </p>
                  <p lang="ar" dir="rtl">
                    {seller.descriptionAr}
                  </p>
                  <SellerReviewForm locale={locale} sellerId={seller.sellerId} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Shell>
  );
}
