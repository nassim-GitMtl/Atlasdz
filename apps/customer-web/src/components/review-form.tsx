'use client';

import type { OrderReviews } from '@atlas/contracts';
import { useActionState } from 'react';
import { reviewAction } from '@/app/orders/actions';
import { text, type Locale } from '@/lib/i18n';
import { reviewCopy } from '@/lib/review-copy';

/** One delivered item: five radio stars, an optional comment, publish or edit. */
export function ReviewForm({
  orderId,
  sellerOrderId,
  item,
  locale,
}: {
  readonly orderId: string;
  readonly sellerOrderId: string;
  readonly item: OrderReviews['items'][number];
  readonly locale: Locale;
}) {
  const [state, action, pending] = useActionState(reviewAction, {});
  const t = reviewCopy[locale];
  const review = item.review;
  const id = (name: string) => `review-${item.productId}-${name}`;
  return (
    <form action={action} className="auth-form review-form">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="sellerOrderId" value={sellerOrderId} />
      <input type="hidden" name="productId" value={item.productId} />
      <input type="hidden" name="version" value={review?.version ?? 0} />
      <h4>{text(item.title, locale)}</h4>
      {review?.status === 'HIDDEN' && <p className="cart-feedback">{t.hidden}</p>}
      <fieldset className="review-stars">
        <legend>{t.rating}</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} htmlFor={id(String(n))}>
            <input
              id={id(String(n))}
              type="radio"
              name="rating"
              value={n}
              required
              defaultChecked={review?.rating === n}
            />
            <span aria-hidden="true">{'★'.repeat(n)}</span>
            <span className="sr-only">{t.stars(n)}</span>
          </label>
        ))}
      </fieldset>
      <label htmlFor={id('comment')}>
        {t.comment}
        <textarea
          id={id('comment')}
          name="comment"
          maxLength={1000}
          rows={3}
          defaultValue={review?.body ?? ''}
        />
      </label>
      {state.saved && (
        <p role="status" className="notice success">
          {t.saved}
        </p>
      )}
      {state.error && (
        <p role="alert" className="cart-feedback">
          {t.errors[state.error]}
        </p>
      )}
      <button className="button button--primary" type="submit" disabled={pending}>
        {review ? t.save : t.publish}
      </button>
      {review?.reply && (
        <div className="review-reply">
          <strong>{t.reply}</strong>
          <p>{review.reply}</p>
        </div>
      )}
    </form>
  );
}
