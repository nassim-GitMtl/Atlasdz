import { redirect } from 'next/navigation';
import {
  CategoryCreateForm,
  CategoryEditForm,
  RemovePhotoForm,
  ReviewModerationForm,
  SellerStatusForm,
} from '@/components/admin-forms';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { getCategories, getDashboard, getReviews, getSellers } from '@/lib/admin';
import { adminCopy } from '@/lib/admin-copy';
import { href, localeFrom, money, type SearchParams } from '@/lib/i18n';
import { accessToken } from '@/lib/session';

export default async function Admin({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const locale = localeFrom((await searchParams).lang);
  const t = adminCopy[locale];
  const token = await accessToken();
  if (!token) redirect(href('/login', locale));
  const result = await Promise.all([getDashboard(token), getSellers(token), getCategories(token)])
    .then(([metrics, sellers, categories]) => ({ metrics, sellers, categories, error: undefined }))
    .catch((error: unknown) => ({
      metrics: {},
      sellers: { items: [] },
      categories: { items: [] },
      error,
    }));
  // Loaded on its own: moderation stays reachable even if one list is unavailable.
  const reviews = result.error ? null : await getReviews(token).catch(() => null);
  const day = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-DZ' : 'fr-DZ', { dateStyle: 'medium' });
  return (
    <Shell locale={locale} currentPath="/admin" signedIn>
      {result.error ? (
        <ServiceState error={result.error} locale={locale} retryPath="/admin" />
      ) : (
        <>
          <div className="page-heading">
            <h1>{t.title}</h1>
          </div>
          <section aria-labelledby="admin-metrics">
            <h2 id="admin-metrics">{t.dashboard}</h2>
            <dl className="admin-metrics">
              {Object.entries(result.metrics).map(([key, value]) => (
                <div key={key}>
                  <dt>{t.metrics[key] ?? key}</dt>
                  <dd>{key.endsWith('Minor') ? money(value, locale) : value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section aria-labelledby="admin-sellers">
            <h2 id="admin-sellers">{t.sellers}</h2>
            <ul className="seller-applications">
              {result.sellers.items.map((seller) => (
                <li key={seller.sellerId} className="offers-panel">
                  <h3>
                    {seller.name} <span className="badge">{seller.status}</span>
                  </h3>
                  <p>
                    /{seller.slug} · {seller.approvedOffers} {t.offers} · {seller.orders} {t.orders}
                  </p>
                  {seller.suspendedReason && <p>{seller.suspendedReason}</p>}
                  <SellerStatusForm seller={seller} locale={locale} />
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="admin-categories">
            <h2 id="admin-categories">{t.categories}</h2>
            <div className="admin-table">
              {result.categories.items.map((category) => (
                <CategoryEditForm key={category.id} category={category} locale={locale} />
              ))}
            </div>
            <CategoryCreateForm locale={locale} />
          </section>
          <section aria-labelledby="admin-reviews">
            <h2 id="admin-reviews">{t.reviews}</h2>
            {reviews === null ? (
              <p className="notice error">{t.reviewsUnavailable}</p>
            ) : reviews.items.length === 0 ? (
              <p>{t.reviewsEmpty}</p>
            ) : (
              <ul className="seller-applications">
                {reviews.items.map((review) => (
                  <li key={review.id} className="offers-panel">
                    <h3>
                      <span role="img" aria-label={`${review.rating}/5`}>
                        {'★'.repeat(review.rating) + '☆'.repeat(5 - review.rating)}
                      </span>{' '}
                      <span className="badge">
                        {review.status === 'HIDDEN' ? t.reviewHidden : t.reviewPublished}
                      </span>
                    </h3>
                    <p>
                      {review.productTitle[locale]} · {review.sellerName} ·{' '}
                      {day.format(new Date(review.createdAt))}
                    </p>
                    {review.body && <blockquote>{review.body}</blockquote>}
                    {review.reply && (
                      <p>
                        <strong>{t.reviewReply} :</strong> {review.reply}
                      </p>
                    )}
                    {review.moderationReason && (
                      <p>
                        <strong>{t.reviewHiddenBecause} :</strong> {review.moderationReason}
                      </p>
                    )}
                    <ReviewModerationForm review={review} locale={locale} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="admin-photos" className="offers-panel">
            <h2 id="admin-photos">{t.photos}</h2>
            <RemovePhotoForm locale={locale} />
          </section>
        </>
      )}
    </Shell>
  );
}
