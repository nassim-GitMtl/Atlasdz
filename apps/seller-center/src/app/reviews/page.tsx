import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ReviewReplyForm } from '@/components/forms';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { listSellerReviews } from '@/lib/api';
import { href, localeFrom, type SearchParams, localized } from '@/lib/i18n';
import { orderDate } from '@/lib/orders-copy';
import { localAccountsEnabled } from '@/lib/security';
import { accessToken } from '@/lib/session';

const copy = {
  fr: {
    title: 'Avis clients',
    body: 'Les avis des acheteurs qui ont reçu vos articles. Une réponse courtoise et utile rassure les prochains clients.',
    average: 'Note moyenne',
    count: '{n} avis',
    waiting: 'Sans réponse',
    hidden: 'Masqué par Atlas DZ',
    none: 'Pas encore d’avis.',
    more: 'Avis plus anciens',
  },
  en: {
    title: 'Customer reviews',
    body: 'Reviews from buyers who received your items. A polite, useful reply reassures future customers.',
    average: 'Average rating',
    count: '{n} reviews',
    waiting: 'No reply yet',
    hidden: 'Hidden by Atlas DZ',
    none: 'No reviews yet.',
    more: 'Older reviews',
  },
  ar: {
    title: 'تقييمات الزبائن',
    body: 'تقييمات المشترين الذين استلموا منتجاتك. رد لطيف ومفيد يطمئن الزبائن القادمين.',
    average: 'متوسط التقييم',
    count: '{n} تقييم',
    waiting: 'بلا رد',
    hidden: 'أخفاه أطلس DZ',
    none: 'لا توجد تقييمات بعد.',
    more: 'تقييمات أقدم',
  },
} as const;

export default async function Reviews({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const locale = localeFrom(query.lang);
  const t = copy[locale];
  const token = await accessToken();
  if (!token) redirect(href('/login', locale));
  const local = localAccountsEnabled(process.env, (await headers()).get('host'));
  const cursor = typeof query.cursor === 'string' ? query.cursor : undefined;
  const result = await listSellerReviews(token, cursor)
    .then((page) => ({ page, error: undefined }))
    .catch((error: unknown) => ({ page: undefined, error }));
  const page = result.page;
  return (
    <Shell locale={locale} currentPath="/reviews" signedIn local={local}>
      <div className="page-heading">
        <div>
          <h1>{t.title}</h1>
          <p>{t.body}</p>
        </div>
        {page && page.summary.count > 0 && (
          <span className="large-count">
            ★ {page.summary.average?.toFixed(1).replace('.', locale === 'fr' ? ',' : '.')}
          </span>
        )}
      </div>
      {!page ? (
        <ServiceState error={result.error} locale={locale} retryPath="/reviews" />
      ) : page.items.length === 0 ? (
        <p className="panel-empty">{t.none}</p>
      ) : (
        <section className="seller-order-list">
          {page.items.map((review) => (
            <article className="seller-order-card" key={review.id}>
              <div className="order-row__head">
                <h2>
                  <span aria-label={`${review.rating}/5`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>{' '}
                  {localized(review.productTitle, locale)}
                </h2>
                {review.status === 'HIDDEN' ? (
                  <span className="badge badge--bad">{t.hidden}</span>
                ) : !review.reply ? (
                  <span className="badge badge--action">{t.waiting}</span>
                ) : null}
              </div>
              <p className="order-row__meta">{orderDate(review.createdAt, locale)}</p>
              {review.body && <p>{review.body}</p>}
              <ReviewReplyForm locale={locale} reviewId={review.id} version={review.version} reply={review.reply} />
            </article>
          ))}
        </section>
      )}
      {page?.nextCursor && (
        <Link className="button secondary small" href={`${href('/reviews', locale)}&cursor=${encodeURIComponent(page.nextCursor)}`}>
          {t.more}
        </Link>
      )}
    </Shell>
  );
}
