'use client';
import { useActionState } from 'react';
import { reorderAction } from '@/app/cart/actions';
import { lang, type Locale } from '@/lib/i18n';

/** "Order again": the items still on sale go back to the cart at today's price. */
export function ReorderForm({ orderId, locale }: { readonly orderId: string; readonly locale: Locale }) {
  const [state, action, pending] = useActionState(reorderAction, {});
  return (
    <form action={action} className="reorder-form">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="lang" value={locale} />
      <button className="button button--secondary" type="submit" disabled={pending}>
        {lang(locale, 'Commander à nouveau', 'اطلب مجددًا', 'Order again')}
      </button>
      {state.error && (
        <p className="notice error" role="alert">
          {state.error === 'none'
            ? lang(locale, 'Aucun de ces articles n’est encore en vente.', 'لم يعد أي من هذه المنتجات معروضًا للبيع.', 'None of these items is on sale any more.')
            : state.error === 'auth'
              ? lang(locale, 'Reconnectez-vous pour continuer.', 'سجّل الدخول من جديد للمتابعة.', 'Sign in again to continue.')
              : lang(locale, 'Le service ne répond pas. Réessayez.', 'الخدمة لا تستجيب. حاول مجددًا.', 'The service is not responding. Try again.')}
        </p>
      )}
    </form>
  );
}
