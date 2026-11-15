import type { ReviewPage } from '@atlas/contracts';
import { text, type Locale } from '@/lib/i18n';

const copy = {
  fr: {
    title: 'Avis clients',
    none: 'Pas encore d’avis. Les acheteurs peuvent noter un article une fois livré.',
    count: (n: number) => `${n} avis`,
    outOf: (value: string) => `${value} sur 5`,
    verified: 'Achat vérifié',
    sellerReply: 'Réponse du vendeur',
    note: 'Seuls les clients qui ont reçu l’article peuvent le noter, depuis leur commande.',
  },
  en: {
    title: 'Customer reviews',
    none: 'No reviews yet. Buyers can rate an item once it is delivered.',
    count: (n: number) => `${n} review${n === 1 ? '' : 's'}`,
    outOf: (value: string) => `${value} out of 5`,
    verified: 'Verified purchase',
    sellerReply: 'Seller’s reply',
    note: 'Only customers who received the item can rate it, from their order.',
  },
  ar: {
    title: 'آراء الزبائن',
    none: 'لا توجد آراء بعد. يمكن للمشترين تقييم المنتج بعد استلامه.',
    count: (n: number) => `${n} رأي`,
    outOf: (value: string) => `${value} من 5`,
    verified: 'شراء مؤكد',
    sellerReply: 'ردّ البائع',
    note: 'يمكن فقط للزبائن الذين استلموا المنتج تقييمه، من صفحة طلبهم.',
  },
} as const;

const stars = (value: number) => {
  const full = Math.round(value);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
};

/** Published reviews: average, then the latest ten (reviewers are never named). */
export function ReviewsSection({
  page,
  locale,
  showProduct = false,
}: {
  readonly page: ReviewPage;
  readonly locale: Locale;
  readonly showProduct?: boolean;
}) {
  const t = copy[locale];
  const region = locale === 'ar' ? 'ar-DZ' : 'fr-DZ';
  const rating = (value: number) =>
    new Intl.NumberFormat(region, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
      value,
    );
  const day = new Intl.DateTimeFormat(region, { dateStyle: 'medium' });
  const { summary } = page;
  return (
    <section className="product-information reviews" aria-labelledby="reviews-title">
      <h2 id="reviews-title">{t.title}</h2>
      {summary.count === 0 || summary.average === null ? (
        <p>{t.none}</p>
      ) : (
        <>
          <p className="rating-summary">
            <span className="rating-stars" role="img" aria-label={t.outOf(rating(summary.average))}>
              {stars(summary.average)}
            </span>{' '}
            <strong>{rating(summary.average)}</strong> · {t.count(summary.count)}
          </p>
          <ul className="review-list">
            {page.items.slice(0, 10).map((review) => (
              <li key={review.id} className="review">
                <p className="review-head">
                  <span
                    className="rating-stars"
                    role="img"
                    aria-label={t.outOf(rating(review.rating))}
                  >
                    {stars(review.rating)}
                  </span>
                  <span className="review-verified">{t.verified}</span>
                  <time dateTime={review.createdAt}>{day.format(new Date(review.createdAt))}</time>
                </p>
                {showProduct && (
                  <p className="review-product">{text(review.productTitle, locale)}</p>
                )}
                {review.body && <p className="review-body">{review.body}</p>}
                {review.reply && (
                  <div className="review-reply">
                    <strong>
                      {t.sellerReply} · {review.sellerName}
                    </strong>
                    <p>{review.reply}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="review-note">{t.note}</p>
    </section>
  );
}
