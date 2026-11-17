import { randomUUID } from 'node:crypto';
import { MAX_GALLERY_PHOTOS, PRODUCT_SPEC_LABELS, type ProductSpec } from '@atlas/contracts';
import Link from 'next/link';
import { Fragment } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Shell } from './shell';
import { ServiceState } from './states';
import { ProductForm, ProductReviewForm } from './product-forms';
import { ProductPhotoForm, ProductPhotos, RemovePhotoButton } from './auth-forms';
import { listProductCategories, listProductSubmissions } from '@/lib/api';
import { href, localeFrom, type Locale, type SearchParams, localized } from '@/lib/i18n';
import { productsCopy } from '@/lib/products-copy';
import { localAccountsEnabled } from '@/lib/security';
import { accessToken } from '@/lib/session';

export async function ProductWorkspace({
  searchParams,
  review = false,
}: {
  readonly searchParams: Promise<SearchParams>;
  readonly review?: boolean;
}) {
  const params = await searchParams;
  const locale = localeFrom(params.lang);
  const t = productsCopy[locale];
  const token = await accessToken();
  if (!token) redirect(href('/', locale));
  const path = review ? '/moderation/products' : '/products';
  const local = localAccountsEnabled(process.env, (await headers()).get('host'));
  const result = await Promise.all([
    listProductSubmissions(token, review),
    review ? Promise.resolve({ items: [] }) : listProductCategories(token),
  ])
    .then(([submissions, categories]) => ({
      submissions: submissions.items,
      categories: categories.items,
      error: undefined,
    }))
    .catch((error: unknown) => ({ submissions: [], categories: [], error }));
  return (
    <Shell locale={locale} currentPath={path} signedIn local={local}>
      {result.error ? (
        <ServiceState error={result.error} locale={locale} retryPath={path} />
      ) : (
        <>
          <div className="page-heading">
            <div>
              <h1>{review ? t.review : t.title}</h1>
              <p>{review ? t.reviewBody : t.body}</p>
            </div>
          </div>
          {(params.submitted === '1' || params.reviewed === '1') && (
            <p role="status" className="notice success">
              {review ? t.reviewed : t.submitted}
            </p>
          )}
          {!review && (
            <section className="form-panel">
              <h2>{t.newProduct}</h2>
              <ProductForm
                locale={locale}
                requestId={randomUUID()}
                categories={result.categories}
              />
            </section>
          )}
          <p>{t.listingLimit}</p>
          {result.submissions.length === 0 ? (
            <p className="empty-state">{t.empty}</p>
          ) : (
            <div className="review-grid">
              {result.submissions.map((s) => (
                <article className="review-card" key={s.id}>
                  <span className={`badge ${s.status === 'APPROVED' ? 'approved' : ''}`}>
                    {t[s.status]}
                  </span>
                  <h2 style={{ overflowWrap: 'anywhere' }}>{localized(s.title, locale)}</h2>
                  <p>{localized(s.category.title, locale)}</p>
                  {s.revisionOfSubmissionId && <p className="notice">{t.revision}</p>}
                  {s.previous && (
                    <details open={review}>
                      <summary>{t.previous}</summary>
                      {(['fr', 'ar'] as const).map((lang) => (
                        <div key={lang} lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                          <h3 style={{ overflowWrap: 'anywhere' }}>{s.previous?.title[lang]}</h3>
                          <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                            {s.previous?.description[lang]}
                          </p>
                        </div>
                      ))}
                      <SpecList specs={s.previous.specs} locale={locale} title={t.specsReview} />
                    </details>
                  )}
                  <details open={review}>
                    <summary>{t.details}</summary>
                    {(['fr', 'ar'] as const).map((lang) => (
                      <div key={lang} lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                        <h3 style={{ overflowWrap: 'anywhere' }}>{s.title[lang]}</h3>
                        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                          {s.description[lang]}
                        </p>
                      </div>
                    ))}
                    <SpecList specs={s.specs} locale={locale} title={t.specsReview} />
                  </details>
                  {s.reviewReason && (
                    <p
                      className="notice"
                      style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                    >
                      {s.reviewReason}
                    </p>
                  )}
                  {!review && s.canRevise && (
                    <Link
                      className="button secondary"
                      href={href(`/products/${s.id}/edit`, locale)}
                    >
                      {t.edit}
                    </Link>
                  )}
                  {review ? (
                    <>
                      <p className="notice">{t.photo}</p>
                      <small className="mono">{s.sellerId}</small>
                      <ProductReviewForm locale={locale} submission={s} decision="APPROVED" />
                      <ProductReviewForm locale={locale} submission={s} decision="REJECTED" />
                    </>
                  ) : (
                    s.productId && (
                      <>
                        <Link
                          className="button"
                          href={`${href('/offers/new', locale)}&productId=${s.productId}`}
                        >
                          {t.createOffer}
                        </Link>
                        {s.revisionOfSubmissionId === null && (
                          <>
                            <ProductPhotos
                              locale={locale}
                              productId={s.productId}
                              imageUrl={s.imageUrl}
                              gallery={s.gallery ?? []}
                            />
                            <ProductPhotoForm locale={locale} productId={s.productId} />
                            <RemovePhotoButton locale={locale} productId={s.productId} />
                            {(s.gallery?.length ?? 0) < MAX_GALLERY_PHOTOS && (
                              <ProductPhotoForm locale={locale} productId={s.productId} gallery />
                            )}
                          </>
                        )}
                      </>
                    )
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

/** Characteristics as the seller stated them, for the seller and for staff review. */
function SpecList({
  specs,
  locale,
  title,
}: {
  readonly specs: readonly ProductSpec[] | undefined;
  readonly locale: Locale;
  readonly title: string;
}) {
  if (!specs?.length) return null;
  return (
    <>
      <h3>{title}</h3>
      <dl className="kv-list">
        {specs.map((spec) => (
          <Fragment key={spec.key}>
            <dt>{PRODUCT_SPEC_LABELS[spec.key][locale]}</dt>
            <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{spec.value}</dd>
          </Fragment>
        ))}
      </dl>
    </>
  );
}
