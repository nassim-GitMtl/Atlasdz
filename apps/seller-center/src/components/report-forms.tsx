'use client';
import { useActionState } from 'react';
import { resolveReportsAction } from '@/app/actions';
import { copy, lang, type Locale } from '@/lib/i18n';

/** Staff decision on a reported product: keep it (dismiss) or take it off sale. */
export function ResolveReportsForm({ productId, locale }: { readonly productId: string; readonly locale: Locale }) {
  const [state, action, pending] = useActionState(resolveReportsAction, {});
  if (state.done)
    return (
      <p className="notice success" role="status">
        {lang(locale, 'Signalements traités.', 'تمت معالجة البلاغات.', 'Reports handled.')}
      </p>
    );
  return (
    <form action={action} className="review-actions">
      <input type="hidden" name="productId" value={productId} />
      {state.error && (
        <p className="notice error" role="alert">
          {copy[locale][state.error === 'csrf' ? 'csrf' : state.error === 'unauthorized' ? 'unauthorized' : 'unavailable']}
        </p>
      )}
      <button className="button secondary small" type="submit" name="action" value="DISMISS" disabled={pending}>
        {lang(locale, 'Classer sans suite', 'حفظ دون إجراء', 'Dismiss')}
      </button>
      <button className="button danger small" type="submit" name="action" value="REMOVE_PRODUCT" disabled={pending}>
        {lang(locale, 'Retirer le produit', 'سحب المنتج', 'Remove the product')}
      </button>
    </form>
  );
}
